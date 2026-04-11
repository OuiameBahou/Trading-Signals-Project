"""
llm_summarizer.py – Generate structural daily summaries using GPT-4o.

Fetches aggregated sentiment metrics and key news headlines to produce
a concise market intelligence report for traders.
"""

import os
import json
import logging
from typing import Dict, Any, List

from dotenv import load_dotenv

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(project_root, ".env")
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger("analytics.llm")


class GPTMarketSummarizer:
    """Wrapper for OpenAI API to generate structured market summaries."""

    def __init__(self, api_key: str = None):
        if OpenAI is None:
            raise ImportError("Please install the 'openai' package.")
            
        # Prioritize passed key, then env
        key = api_key or os.getenv("OPENAI_API_KEY")
        if not key or key == "sk-your-openai-key-here":
            logger.warning("OPENAI_API_KEY is not configured properly.")

        self.client = OpenAI(api_key=key)
        self.model = "gpt-4o"

    def generate_daily_report(
        self, 
        asset_symbol: str, 
        sentiment_data: Dict[str, Any], 
        top_news: List[str]
    ) -> Dict[str, Any]:
        """
        Sends the day's aggregated metrics and key news for an asset to GPT-4o
        and requests a structured JSON response.
        """
        
        system_prompt = (
            "You are an expert quantitative analyst and macro trader. Your goal is to analyze the provided "
            f"sentiment metrics and top messages exclusively for the asset {asset_symbol}, and produce a "
            "structured, professional daily summary in JSON format.\n\n"
            "CRITICAL RULES:\n"
            f"1. You MUST evaluate sentiment based ONLY on the provided messages/news for {asset_symbol}.\n"
            "2. Do NOT hallucinate generic market trends that are not reflected in the provided messages.\n"
            f"3. Ensure the 'risk_warning' explicitly relates to {asset_symbol}.\n\n"
            "Format your response as a valid JSON object matching exactly this schema:\n"
            "{\n"
            f"  \"asset\": \"{asset_symbol}\",\n"
            "  \"overall_sentiment_direction\": \"Bullish\" | \"Bearish\" | \"Neutral\",\n"
            "  \"key_drivers\": [\"driver 1\", \"driver 2\"],\n"
            f"  \"trader_summary\": \"A 2-3 sentence summary of why {asset_symbol} is moving today based strictly on the provided facts.\",\n"
            "  \"risk_warning\": \"Any anomalies or high-impact events identified in the data.\"\n"
            "}"
        )

        user_content = (
            f"Asset: {asset_symbol}\n"
            f"Aggregated Sentiment Metrics (24h): {json.dumps(sentiment_data)}\n"
            f"Top News Headlines:\n" + "\n".join([f"- {news}" for news in top_news])
        )

        try:
            logger.info(f"Requesting summary for {asset_symbol} via {self.model}...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                response_format={ "type": "json_object" },
                temperature=0.3, # Low temp for consistency
                max_tokens=500
            )

            result_str = response.choices[0].message.content
            return json.loads(result_str)

        except Exception as e:
            logger.error(f"Failed to generate LLM summary: {e}")
            return {
                "error": str(e),
                "asset": asset_symbol,
                "trader_summary": "Summary generation failed."
            }
