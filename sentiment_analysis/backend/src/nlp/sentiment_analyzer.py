"""
sentiment_analyzer.py – FinBERT wrapper for sentiment analysis.

Uses HuggingFace 'ProsusAI/finbert' to score financial text as:
Positive, Negative, or Neutral, and returns confidence values.
"""

import logging
from typing import Dict, List, Any

# Delay large imports to prevent high memory overhead during initial loads
try:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
except ImportError:
    torch = None
    AutoModelForSequenceClassification = None
    AutoTokenizer = None

logger = logging.getLogger("nlp.sentiment")

# Model constants
FINBERT_MODEL = "ProsusAI/finbert"


class SentimentAnalyzer:
    """Wrapper around HuggingFace Transformers for financial sentiment."""

    def __init__(self, use_gpu: bool = False):
        if torch is None or AutoModelForSequenceClassification is None:
            raise ImportError("Please install 'torch' and 'transformers'.")

        self.device = torch.device(
            "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
        )
        logger.info(f"Loading {FINBERT_MODEL} on {self.device}...")

        self.tokenizer = AutoTokenizer.from_pretrained(FINBERT_MODEL)
        self.model = AutoModelForSequenceClassification.from_pretrained(FINBERT_MODEL)
        self.model.to(self.device)
        self.model.eval()
        
        # FinBERT labels mapping: 0=positive, 1=negative, 2=neutral
        self.labels = ["positive", "negative", "neutral"]

    def analyze_batch(self, texts: List[str], batch_size: int = 16) -> List[Dict[str, Any]]:
        """
        Takes a batch of clean text and returns a list of dictionaries 
        containing the sentiment distribution and the dominant sentiment.
        Includes internal chunking to avoid OOM errors on CPU/GPU.
        """
        if not texts:
            return []

        all_probs = []

        # Process in chunks to save memory
        for i in range(0, len(texts), batch_size):
            chunk = texts[i : i + batch_size]
            
            # Tokenization
            inputs = self.tokenizer(
                chunk, padding=True, truncation=True, max_length=512, return_tensors="pt"
            )
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Inference
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probs = torch.nn.functional.softmax(logits, dim=-1)
                all_probs.extend(probs.cpu().tolist())

        # Parse results
        results = []
        for i, prob_list in enumerate(all_probs):
            # Find the max probability
            max_p = max(prob_list)
            max_idx = prob_list.index(max_p)
            dominant = self.labels[max_idx]

            results.append({
                "sentiment": dominant,
                "confidence": max_p,
                "scores": {
                    "positive": prob_list[0],
                    "negative": prob_list[1],
                    "neutral":  prob_list[2],
                }
            })

        return results

    def analyze(self, text: str) -> Dict[str, Any]:
        """Convenience wrapper around analyze_batch for a single text."""
        return self.analyze_batch([text])[0]
