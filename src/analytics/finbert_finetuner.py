"""
finbert_finetuner.py – Fine-tune ProsusAI/finbert on high-confidence in-domain labels.

This utility extracts high-confidence sentiment records from ``data/nlp_results.jsonl``
and uses them as a training set to fine-tune the FinBERT model.  Fine-tuning on
your own financial headlines (even a few hundred samples at confidence ≥ 0.90)
can meaningfully improve classification accuracy for the specific vocabulary and
topics covered by your asset universe.

Requirements (already in requirements.txt):
    transformers>=4.36
    torch>=2.1
    scikit-learn>=1.3

Recommended minimum dataset: 150+ samples (50+ per class).

CLI usage::

    # Prepare and inspect the training set
    python -m src.analytics.finbert_finetuner --inspect --min_confidence 0.9

    # Full fine-tune run (saves model to models/finbert_local/)
    python -m src.analytics.finbert_finetuner --min_confidence 0.9 --epochs 3

    # Use the fine-tuned model in SentimentAnalyzer
    # (set MODEL_NAME env var or pass model_path to SentimentAnalyzer.__init__)
"""

import argparse
import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
DATA_DIR       = os.path.join(_ROOT, "data")
NLP_FILE       = os.path.join(DATA_DIR, "nlp_results.jsonl")
DEFAULT_OUTPUT = os.path.join(_ROOT, "models", "finbert_local")

LABEL2ID = {"positive": 0, "negative": 1, "neutral": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}


# ---------------------------------------------------------------------------
# Step 1: Prepare training data
# ---------------------------------------------------------------------------

def prepare_training_data(
    min_confidence: float = 0.9,
    exclude_augmented: bool = True,
    min_text_length: int = 10,
) -> List[Dict[str, str]]:
    """
    Extract high-confidence records from ``nlp_results.jsonl`` as labelled
    training samples.

    Args:
        min_confidence:    Only include records with FinBERT confidence >= this.
                           Higher values give cleaner labels but fewer samples.
        exclude_augmented: Skip augmented records (train on real data only).
        min_text_length:   Minimum character length for the text field.

    Returns:
        List of ``{"text": str, "label": str}`` dicts where ``label`` is one of
        ``"positive"``, ``"negative"``, or ``"neutral"``.
    """
    samples: List[Dict[str, str]] = []

    if not os.path.exists(NLP_FILE):
        logger.warning("prepare_training_data: %s not found", NLP_FILE)
        return samples

    with open(NLP_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            if exclude_augmented and obj.get("augmented"):
                continue

            ticker = obj.get("ticker", "")
            if not ticker or ticker.upper() == "UNKNOWN":
                continue

            confidence = float(obj.get("confidence", 0) or 0)
            if confidence < min_confidence:
                continue

            text = obj.get("text", "").strip()
            if not text or len(text) < min_text_length:
                continue

            label = obj.get("sentiment", "")
            if label not in LABEL2ID:
                continue

            samples.append({"text": text, "label": label})

    logger.info(
        "prepare_training_data: %d samples at min_confidence=%.2f (augmented excluded=%s)",
        len(samples), min_confidence, exclude_augmented,
    )
    return samples


def _print_dataset_stats(samples: List[Dict[str, str]]) -> None:
    """Print a class distribution summary to stdout."""
    from collections import Counter
    counts = Counter(s["label"] for s in samples)
    total = len(samples)
    print(f"\n  Total samples : {total}")
    for label in ("positive", "negative", "neutral"):
        n = counts.get(label, 0)
        pct = 100 * n / total if total else 0
        print(f"  {label:10s}: {n:4d}  ({pct:.1f}%)")
    if total < 50:
        print("\n  [WARN] Very few samples. Consider lowering --min_confidence.")
    elif total < 150:
        print("\n  [WARN] Small dataset. Fine-tuning results may be noisy.")
    print()


# ---------------------------------------------------------------------------
# Step 2: Fine-tune
# ---------------------------------------------------------------------------

def finetune_finbert(
    dataset: List[Dict[str, str]],
    epochs: int = 3,
    output_dir: str = DEFAULT_OUTPUT,
    test_split: float = 0.1,
    batch_size: int = 8,
    learning_rate: float = 2e-5,
    warmup_ratio: float = 0.1,
) -> Dict[str, Any]:
    """
    Fine-tune ``ProsusAI/finbert`` on ``dataset`` using HuggingFace ``Trainer``.

    Args:
        dataset:       List of ``{"text": str, "label": str}`` from
                       :func:`prepare_training_data`.
        epochs:        Number of training epochs (default 3).
        output_dir:    Directory to save the fine-tuned model and tokenizer.
        test_split:    Fraction held out as evaluation set (default 0.1).
        batch_size:    Per-device batch size for training and evaluation.
        learning_rate: AdamW learning rate (default 2e-5).
        warmup_ratio:  Fraction of total steps used for LR warmup.

    Returns:
        Dict with keys ``output_dir``, ``n_train``, ``n_eval``,
        ``eval_results``, and optionally ``error``.
    """
    try:
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
            Trainer,
            TrainingArguments,
        )
        from sklearn.model_selection import train_test_split
        import torch
    except ImportError as exc:
        logger.error("finetune_finbert: missing dependency: %s", exc)
        return {"error": str(exc)}

    if not dataset:
        return {"error": "Empty dataset – nothing to train on."}

    texts  = [d["text"]  for d in dataset]
    labels = [LABEL2ID[d["label"]] for d in dataset]

    # Stratified split to preserve class balance
    try:
        train_texts, eval_texts, train_labels, eval_labels = train_test_split(
            texts, labels,
            test_size=test_split,
            random_state=42,
            stratify=labels,
        )
    except ValueError:
        # Fall back to random split if stratification fails (very few samples)
        train_texts, eval_texts, train_labels, eval_labels = train_test_split(
            texts, labels, test_size=test_split, random_state=42
        )

    tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
    model = AutoModelForSequenceClassification.from_pretrained(
        "ProsusAI/finbert",
        num_labels=3,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    )

    class _SentimentDataset(torch.utils.data.Dataset):
        def __init__(self, encodings, labels):
            self.encodings = encodings
            self.labels = labels

        def __getitem__(self, idx):
            item = {k: v[idx] for k, v in self.encodings.items()}
            item["labels"] = torch.tensor(self.labels[idx])
            return item

        def __len__(self):
            return len(self.labels)

    train_enc = tokenizer(
        train_texts, truncation=True, padding=True, max_length=512
    )
    eval_enc = tokenizer(
        eval_texts, truncation=True, padding=True, max_length=512
    )
    train_ds = _SentimentDataset(train_enc, train_labels)
    eval_ds  = _SentimentDataset(eval_enc, eval_labels)

    os.makedirs(output_dir, exist_ok=True)

    total_steps = (len(train_ds) // batch_size) * epochs
    warmup_steps = max(1, int(total_steps * warmup_ratio))

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=learning_rate,
        warmup_steps=warmup_steps,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        logging_steps=max(1, total_steps // 20),
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
    )

    logger.info(
        "finetune_finbert: starting training — %d train, %d eval, %d epochs",
        len(train_ds), len(eval_ds), epochs,
    )
    trainer.train()
    eval_results = trainer.evaluate()
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)

    logger.info(
        "finetune_finbert: model saved to %s (eval_loss=%.4f)",
        output_dir, eval_results.get("eval_loss", -1.0),
    )
    return {
        "output_dir": output_dir,
        "n_train": len(train_ds),
        "n_eval": len(eval_ds),
        "eval_results": eval_results,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)-8s %(name)s – %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Fine-tune FinBERT on high-confidence in-domain sentiment labels"
    )
    parser.add_argument(
        "--min_confidence", type=float, default=0.9,
        help="Minimum FinBERT confidence to include a sample (default: 0.9)",
    )
    parser.add_argument(
        "--epochs", type=int, default=3,
        help="Number of training epochs (default: 3)",
    )
    parser.add_argument(
        "--output_dir", type=str, default=DEFAULT_OUTPUT,
        help=f"Output directory for the fine-tuned model (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--include_augmented", action="store_true",
        help="Include augmented records in the training set (default: excluded)",
    )
    parser.add_argument(
        "--inspect", action="store_true",
        help="Print dataset statistics only, do not train",
    )
    args = parser.parse_args()

    print(f"\nPreparing training data (min_confidence={args.min_confidence})...")
    data = prepare_training_data(
        min_confidence=args.min_confidence,
        exclude_augmented=not args.include_augmented,
    )
    _print_dataset_stats(data)

    if args.inspect:
        print("Inspect-only mode — exiting without training.")
    elif len(data) < 10:
        print(
            f"[ERROR] Only {len(data)} samples found. "
            "Try lowering --min_confidence (e.g. --min_confidence 0.75)."
        )
    else:
        result = finetune_finbert(
            data,
            epochs=args.epochs,
            output_dir=args.output_dir,
        )
        if "error" in result:
            print(f"[ERROR] {result['error']}")
        else:
            print(
                f"Fine-tuning complete.\n"
                f"  Model saved to : {result['output_dir']}\n"
                f"  Train samples  : {result['n_train']}\n"
                f"  Eval samples   : {result['n_eval']}\n"
                f"  Eval loss      : {result['eval_results'].get('eval_loss', 'N/A'):.4f}\n"
                f"\nTo use the fine-tuned model, set the MODEL_NAME environment variable:\n"
                f"  MODEL_NAME={result['output_dir']}"
            )
