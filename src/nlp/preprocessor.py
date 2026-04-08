"""
preprocessor.py – Financial text cleaner for NLP tasks.

Cleans and normalizes text by:
  • Removing URLs and user tags
  • Converting visual financial emojis (bulls, bears, rockets) to text
  • Isolating or removing cashtags ($AAPL) safely depending on the need
"""

import re
import emoji

# Pre-compiled regex patterns
URL_PATTERN = re.compile(r"http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+")
USER_MENTION_PATTERN = re.compile(r"@[A-Za-z0-9_]+")
CASHTAG_PATTERN = re.compile(r"\$[A-Za-z]+")

# Financial emoji translations
FINANCIAL_EMOJIS = {
    "🚀": " bullish ",
    "🌕": " bullish ",
    "📈": " bullish ",
    "🐂": " bullish ",
    "🐃": " bullish ",
    "🔥": " bullish ",
    "🐻": " bearish ",
    "📉": " bearish ",
    "🩸": " bearish ",
    "💩": " bearish ",
    "🚮": " bearish ",
}


class FinancialPreprocessor:
    """Preprocesses raw financial text (tweets, news) into clean strings."""

    def __init__(self, keep_cashtags: bool = True):
        self.keep_cashtags = keep_cashtags

    def clean_text(self, text: str) -> str:
        """
        Applies a series of regex and string replacements to clean text.
        """
        if not text or not isinstance(text, str):
            return ""

        # 1. URLs
        text = URL_PATTERN.sub(" ", text)

        # 2. User mentions (@someone)
        text = USER_MENTION_PATTERN.sub(" ", text)

        # 3. Financial emojis translating to sentiments
        for emj, word in FINANCIAL_EMOJIS.items():
            text = text.replace(emj, word)

        # 4. Remove other emojis completely
        text = emoji.replace_emoji(text, replace=" ")

        # 5. Cashtags ($AAPL -> AAPL or remove)
        if self.keep_cashtags:
            # Just remove the $ but keep the ticker
            text = text.replace("$", "")
        else:
            text = CASHTAG_PATTERN.sub(" ", text)

        # 6. HTML artifacts (like &amp;)
        text = text.replace("&amp;", " and ")
        text = text.replace("&lt;", " < ")
        text = text.replace("&gt;", " > ")
        text = text.replace("&quot;", ' " ')

        # 7. Multiple spaces and newlines
        text = re.sub(r"\s+", " ", text).strip()

        return text
