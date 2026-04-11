"""
pipeline.py – Master NLP pipeline.

Combines Preprocessor and SentimentAnalyzer
into one unified flow: Raw Text -> Clean Text -> Sentiment.
"""

import logging
from typing import Dict, Any, List

from nlp.preprocessor import FinancialPreprocessor
from nlp.sentiment_analyzer import SentimentAnalyzer

logger = logging.getLogger("nlp.pipeline")

class NLPPipeline:
    """End-to-end NLP processing for financial text."""

    def __init__(self, use_gpu: bool = False, enable_explainability: bool = False):
        logger.info("Initializing NLP Pipeline...")
        
        # 1. Cleaning
        self.preprocessor = FinancialPreprocessor()

        # 2. Sentiment
        self.sentiment = SentimentAnalyzer(use_gpu=use_gpu)

    def process(self, text: str) -> Dict[str, Any]:
        """Process a single text through the full pipeline."""
        if not text:
            return {}

        # 1. Clean
        clean_text = self.preprocessor.clean_text(text)

        # 2. Sentiment
        sentiment_result = self.sentiment.analyze(clean_text)

        return {
            "original_text": text,
            "clean_text": clean_text,
            "sentiment": sentiment_result,
            "entities": [],
            "explanation": {}
        }

    def process_batch(self, texts: List[str]) -> List[Dict[str, Any]]:
        """Process a batch of texts effectively."""
        cleaned_texts = [self.preprocessor.clean_text(t) for t in texts]
        
        # Batch sentiment is fast
        sentiments = self.sentiment.analyze_batch(cleaned_texts)
        
        results = []
        for i, text in enumerate(texts):
            clean_t = cleaned_texts[i]
            
            results.append({
                "original_text": text,
                "clean_text": clean_t,
                "sentiment": sentiments[i],
                "entities": [],
                "explanation": {}
            })
            
        return results
