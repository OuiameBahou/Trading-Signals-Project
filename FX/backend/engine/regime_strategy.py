# regime_strategy.py
# Extracted verbatim from AWB_Backtest_Regime_Check_FIXED.ipynb
# DO NOT MODIFY — this is a source-of-truth file derivative.

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from abc import ABC, abstractmethod
from itertools import combinations
from tqdm import tqdm
import itertools
from collections import defaultdict
import copy
import warnings
import os
warnings.filterwarnings('ignore')


# ---------------------------------------------------------------------------
# Data Loaders  (Cell 4)
# ---------------------------------------------------------------------------

class DataLoader(ABC):
    @abstractmethod
    def load_data(self, **kwargs):
        pass

class CSVLoader(DataLoader):
    def load_data(self, file_path, index_col=0, type='csv', columns_map=None):
        if type == 'csv':
            df = pd.read_csv(file_path, index_col=index_col)
            if columns_map:
                df = df.rename(columns=columns_map).iloc[::-1]
            return self._clean_data(df)
        elif type == 'xlsx':
            df = pd.read_excel(file_path, index_col=index_col)
            if columns_map:
                df = df.rename(columns=columns_map)
            return self._clean_data(df)

    # Regarding this function, we won't be filling missing values and removing duplicates
    # as it wouldn't account for only trading days.
    def _clean_data(self, df):
        #df = df.asfreq('D')
        #df = df.ffill().bfill()
        #df = df[~df.index.duplicated(keep='first')]
        return df

class BloombergLoader(DataLoader):
    def load_data(self, symbol, fields, start_date, end_date):
        pass

class TradingViewLoader(DataLoader):
    def load_data(self, widget):
        pass


# ---------------------------------------------------------------------------
# Technical Indicators  (Cell 6)
# ---------------------------------------------------------------------------

class TechnicalIndicator(ABC):
    def __init__(self, window, indicator_type, source='close'):
        self.window = window
        self.indicator_type = indicator_type
        self.source = source

    @abstractmethod
    def compute(self, data):
        pass


class SMA(TechnicalIndicator):
    def __init__(self, window):
        super().__init__(window, 'trend')

    def compute(self, data):
        return data[self.source].rolling(self.window).mean()


class EMA(TechnicalIndicator):
    def __init__(self, window):
        super().__init__(window, 'trend')

    def compute(self, data):
        return data[self.source].ewm(span=self.window, adjust=False).mean()


class RSI(TechnicalIndicator):
    def __init__(self, window):
        super().__init__(window, 'momentum')

    def compute(self, data):
        delta = data[self.source].diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        avg_gain = gain.rolling(self.window).mean()
        avg_loss = loss.rolling(self.window).mean()
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))


class MACD:
    def __init__(self, fast=12, slow=26, signal=9):
        self.indicator_type = 'trend'
        self.fast = fast
        self.slow = slow
        self.signal = signal

    def compute(self, data):
        fast_ema = data['close'].ewm(span=self.fast, adjust=False).mean()
        slow_ema = data['close'].ewm(span=self.slow, adjust=False).mean()
        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=self.signal, adjust=False).mean()
        diff = macd_line - signal_line
        return macd_line, signal_line, diff


class ParabolicSAR:
    def __init__(self, initial_af=0.02, max_af=0.2, step=0.01):
        self.initial_af = initial_af
        self.max_af = max_af
        self.step = step
        self.reset()

    def reset(self):
        self.trend = None
        self.af = self.initial_af
        self.ep = None
        self.sar = None
        self.signals = []
        self.historical_sar = []
        self.prev_high = None
        self.prev_low = None

    def update(self, high, low):
        signal = 0
        if self.trend is None:
            self._initialize(high, low)
            self.signals.append(0)
            return 0

        reversal = False
        new_sar = self._calculate_next_sar()
        prev_trend = self.trend

        if self.trend == 'up':
            if low < new_sar:
                reversal = True
        else:
            if high > new_sar:
                reversal = True

        if reversal:
            self._reverse_trend(high, low, new_sar)
            signal = 1 if prev_trend == 'down' else -1
        else:
            self._continue_trend(high, low, new_sar)

        self.historical_sar.append(self.sar)
        self.signals.append(signal)
        return signal

    def _initialize(self, high, low):
        self.trend = 'up' if high > low else 'down'
        self.ep = high if self.trend == 'up' else low
        self.sar = low if self.trend == 'up' else high
        self.prev_high = high
        self.prev_low = low
        self.historical_sar.append(self.sar)

    def _calculate_next_sar(self):
        if self.trend == 'up':
            return self.sar + self.af * (self.ep - self.sar)
        return self.sar - self.af * (self.sar - self.ep)

    def _reverse_trend(self, high, low, new_sar):
        self.trend = 'down' if self.trend == 'up' else 'up'
        self.sar = self.ep
        self.af = self.initial_af
        self.ep = low if self.trend == 'up' else high

    def _continue_trend(self, high, low, new_sar):
        self.sar = new_sar
        if self.trend == 'up':
            if high > self.ep:
                self.ep = high
                self.af = min(self.af + self.step, self.max_af)
        else:
            if low < self.ep:
                self.ep = low
                self.af = min(self.af + self.step, self.max_af)

    def get_signals(self, index=None):
        if index is not None and len(index) == len(self.signals):
            return pd.Series(self.signals, index=index, name='signal')
        return pd.Series(self.signals, name='signal')


class StochasticOscillator:
    def __init__(self, data=None, k_period=14, d_period=5, smoothing=1):
        self.data = data
        self.k_period = k_period
        self.d_period = d_period
        self.smoothing = smoothing
        self._validate_parameters()
        self._k_values = None
        self._d_values = None
        self.signals = None

    def _validate_parameters(self):
        if self.k_period < 0 or self.d_period < 0:
            raise ValueError("Periods must be positive integers")
        if self.smoothing not in [0, 1, 2, 3]:
            raise ValueError("Smoothing must be 0, 1, 2, or 3")

    def compute(self):
        if self.data is None:
            raise ValueError("No data provided")

        low_min = self.data['low'].rolling(self.k_period).min()
        high_max = self.data['high'].rolling(self.k_period).max()

        k = 100 * (self.data['close'] - low_min) / (high_max - low_min)
        k = k.replace([np.inf, -np.inf], np.nan).ffill()

        if self.smoothing == 0:
            k = k.rolling(1).mean()
        if self.smoothing >= 1:
            k = k.rolling(self.d_period).mean()
        if self.smoothing >= 2:
            k = k.rolling(self.d_period).mean()
        if self.smoothing == 3:
            k = k.rolling(self.d_period).mean()

        self._k_values = k
        self._d_values = k.rolling(self.d_period).mean()
        return self

    def generate_signals(self, overbought=80, oversold=20):
        if self._k_values is None or self._d_values is None:
            raise ValueError("Compute Stochastic values first")

        signals = pd.Series(0, index=self.data.index)

        bullish_cross = (self._k_values > self._d_values) & \
                        (self._k_values.shift(1) <= self._d_values.shift(1)) & \
                        (self._k_values < oversold)

        bearish_cross = (self._k_values < self._d_values) & \
                        (self._k_values.shift(1) >= self._d_values.shift(1)) & \
                        (self._k_values > overbought)

        signals[bullish_cross] = 1
        signals[bearish_cross] = -1

        self.signals = signals
        return signals


class BollingerBands:
    def __init__(self, data, window=38, num_std=2):
        self.data = data
        self.window = window
        self.num_std = num_std
        self.middle_band = None
        self.upper_band = None
        self.lower_band = None
        self.percent_b = None
        self.bandwidth = None
        self.signals = None

    def compute(self):
        self.middle_band = self.data['close'].rolling(self.window).mean()
        std = self.data['close'].rolling(self.window).std()
        self.upper_band = self.middle_band + (std * self.num_std)
        self.lower_band = self.middle_band - (std * self.num_std)

        band_width = self.upper_band - self.lower_band
        self.percent_b = (self.data['close'] - self.lower_band) / band_width.replace(0, np.nan)
        self.bandwidth = band_width / self.middle_band

        return self

    def generate_signals(self, squeeze_threshold=0.3, squeeze_lookback=20):
        if self.middle_band is None:
            self.compute()

        signals = pd.Series(0, index=self.data.index)

        upper_cross = (self.data['close'] > self.upper_band).astype(int).diff()
        lower_cross = (self.data['close'] < self.lower_band).astype(int).diff()

        signals[upper_cross == -1] = -1
        signals[lower_cross == -1] = 1

        squeeze_level = self.bandwidth.rolling(squeeze_lookback).quantile(squeeze_threshold)
        in_squeeze = (self.bandwidth < squeeze_level).fillna(False)

        squeeze_buy = in_squeeze & (self.data['close'] > self.middle_band)
        signals[squeeze_buy & ~in_squeeze.shift(1).fillna(False)] = 1

        squeeze_sell = in_squeeze & (self.data['close'] < self.middle_band)
        signals[squeeze_sell & ~in_squeeze.shift(1).fillna(False)] = -1

        self.signals = signals
        return signals


# ---------------------------------------------------------------------------
# ATR  (Cell 8)
# ---------------------------------------------------------------------------

class ATR:
    def __init__(self, window=14):
        self.window = window
        self._validate_window()

    def _validate_window(self):
        if not isinstance(self.window, int) or self.window < 1:
            raise ValueError("Window must be positive integer")

    def compute(self, data):
        self._check_ohlc(data)
        tr = self._true_range(data)
        atr = self._smooth(tr)
        return atr.rename(f'ATR_{self.window}')

    def _true_range(self, data):
        prev_close = data['close'].shift(1).ffill()
        tr1 = data['high'] - data['low']
        tr2 = (data['high'] - prev_close).abs()
        tr3 = (data['low'] - prev_close).abs()
        return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    def _smooth(self, tr):
        sma_initial = tr.rolling(self.window).mean()[:self.window]
        ema_rest = tr[self.window:].ewm(alpha=1 - (1 / self.window), adjust=False).mean()
        return pd.concat([sma_initial, ema_rest])

    def _check_ohlc(self, data):
        required = ['open', 'high', 'low', 'close']
        missing = [col for col in required if col not in data.columns]
        if missing:
            raise ValueError(f"Données OHLC manquantes : {missing}")


# ---------------------------------------------------------------------------
# SignalGenerator & SignalValidator  (Cell 10)
# ---------------------------------------------------------------------------

class SignalGenerator:
    @staticmethod
    def crossover(series1, series2):
        signals = pd.Series(0, index=series1.index)
        series11 = series1.copy()
        series22 = series2.copy()
        signals[(series11.shift(1) < series22.shift(1)) & (series11 > series22)] = 1
        signals[(series11.shift(1) > series22.shift(1)) & (series11 < series22)] = -1
        return signals

    @staticmethod
    def threshold(rsi_series, oversold=30, overbought=70):
        signals = pd.Series(0, index=rsi_series.index)
        signals[rsi_series < oversold] = 1
        signals[rsi_series > overbought] = -1
        return signals

    @staticmethod
    def combine_signals(signals_list, min_confirmation=2):
        combined = pd.DataFrame(signals_list).T.sum(axis=1)
        confirmation = pd.DataFrame(signals_list).T.abs().sum(axis=1)
        final_signal = pd.Series(0, index=combined.index)
        final_signal[(combined > 0) & (confirmation >= min_confirmation)] = 1
        final_signal[(combined < 0) & (confirmation >= min_confirmation)] = -1
        return final_signal

    def regime_combined(self, df, weights):
        signals = pd.Series(0, index=df.index)
        theta_enter = weights[1]
        eps_trend = weights[2]
        # Volatility regime threshold
        atr_mean = df['atr'].rolling(20).mean()
        atr_std = df['atr'].rolling(20).std()
        vol_level = atr_mean + atr_std
        # check if volatility and trend regimes
        for i in range(1, len(df)):
            row = df.iloc[i]
            vol_regime = 'high' if row['atr'] > vol_level.iloc[i] else 'low'
            trend_slope = row['sma50'] - row['sma200']
            trend_regime = 'trend' if abs(trend_slope) > eps_trend else 'range'

            votes = []

            if trend_regime == 'trend':
                votes += [
                    weights[0]['EMA']  * row.get('EMA_sig', 0),
                    weights[0]['MACD'] * row.get('MACD_sig', 0),
                    weights[0]['PSAR'] * row.get('PSAR_sig', 0)
                ]
            else:
                votes += [
                    weights[0]['RSI'] * row.get('RSI_sig', 0),
                    weights[0]['SO']  * row.get('SO', 0)
                ]

            if vol_regime == 'high':
                votes.append(weights[0]['BB'] * row.get('BB_sig', 0))

            S = sum(votes)

            if S >= theta_enter:
                sig = 1
            elif S <= -theta_enter:
                sig = -1
            else:
                sig = 0
            signals.iat[i] = sig
        return signals


class SignalValidator:
    @staticmethod
    def confirm_volatility(signals, atr, threshold=1.5):
        return signals * (atr > threshold)

    @staticmethod
    def plot_signals(data, signals):
        buy_signals = signals[signals == 1].index
        sell_signals = signals[signals == -1].index
        data['close'].plot(figsize=(15, 7), color='blue')
        data.loc[buy_signals, 'close'].plot(ls='', marker='^', markersize=7, color='g', label='Buy Signal')
        data.loc[sell_signals, 'close'].plot(ls='', marker='v', markersize=7, color='r', label='Sell Signal')
        plt.legend()
        plt.show()

    def plot_positions(self, data, signals, position_log):
        plt.figure(figsize=(15, 7))
        data.index = pd.to_datetime(data.index)
        ax = data['close'].plot(color='black', label='Close Price')

        current_position = None
        position_start = None
        valid_positions = [p for p in position_log if p is not None]

        actual_buy_dates = [p['entry_date'] for p in valid_positions if p['direction'] == 1]
        actual_sell_dates = [p['entry_date'] for p in valid_positions if p['direction'] == -1]

        data.loc[actual_buy_dates, 'close'].plot(
            ax=ax, ls='', marker='^', markersize=9,
            color='lime', markerfacecolor='none', markeredgewidth=1.5,
            label='Validated Buy'
        )
        data.loc[actual_sell_dates, 'close'].plot(
            ax=ax, ls='', marker='v', markersize=9,
            color='red', markerfacecolor='none', markeredgewidth=1.5,
            label='Validated Sell'
        )

        current_direction = None
        position_start = None

        for i, pos in enumerate(position_log):
            date = data.index[i]
            if pos:
                if not current_direction:
                    current_direction = pos['direction']
                    position_start = date
            else:
                if current_direction:
                    color = 'green' if current_direction == 1 else 'red'
                    ax.axvspan(position_start, data.index[i - 1], color=color, alpha=0.2)
                    current_direction = None

        if current_direction:
            ax.axvspan(position_start, data.index[-1],
                       color='green' if current_direction == 1 else 'red', alpha=0.2)

        data.loc[signals[signals == 1].index, 'close'].plot(
            ax=ax, ls='', marker='^', markersize=7, color='blue', alpha=0.3, label='Raw Buy Signals'
        )
        data.loc[signals[signals == -1].index, 'close'].plot(
            ax=ax, ls='', marker='v', markersize=7, color='blue', alpha=0.3, label='Raw Sell Signals'
        )

        plt.title('Price Chart with Validated Positions')
        plt.legend()
        plt.show()


# ---------------------------------------------------------------------------
# PortfolioManager  (Cell 12)
# ---------------------------------------------------------------------------

class PortfolioManager:
    def __init__(self, initial_capital, risk_per_trade=0.05, atr_multiplier=2):
        self.initial_capital = initial_capital
        self.risk_per_trade = risk_per_trade
        self.atr_multiplier = atr_multiplier

    def calculate_position_size(self, price, atr):
        risk_amount = self.initial_capital * self.risk_per_trade
        return risk_amount / (atr * self.atr_multiplier)

    def dynamic_stop_loss(self, entry_price, atr, direction, stp_multiplier):
        if direction == 1:
            return entry_price - (atr * stp_multiplier)
        else:
            return entry_price + (atr * stp_multiplier)

    def dynamic_take_profit(self, entry_price, atr, direction, tp_multiplier):
        if direction == 1:
            return entry_price + (atr * tp_multiplier)
        else:
            return entry_price - (atr * tp_multiplier)


# ---------------------------------------------------------------------------
# Backtester  (Cell 14)
# ---------------------------------------------------------------------------

class Backtester:
    def __init__(self, weights, initial_capital=10_000):
        self.weights = weights
        self.initial_capital = initial_capital
        self.portfolio = PortfolioManager(initial_capital)
        self.data_loader = CSVLoader()
        self.signals = SignalGenerator()
        self.validator = SignalValidator()

    def load_data(self, file_path, type):
        if type == 'csv':
            self.data = self.data_loader.load_data(
                file_path=file_path,
                columns_map={
                    'Price': 'close',
                    'High': 'high',
                    'Low': 'low',
                    'Open': 'open',
                    'Vol.': 'volume'
                },
                type=type)
        elif type == 'xlsx':
            self.data = self.data_loader.load_data(
                file_path=file_path,
                columns_map={
                    'PX_LAST': 'close',
                    'PX_HIGH': 'high',
                    'PX_LOW': 'low',
                    'PX_OPEN': 'open'
                },
                type=type)

    def precompute_indicators(self):
        self.data['sma50'] = SMA(50).compute(self.data)
        self.data['sma200'] = SMA(200).compute(self.data)
        self.data['rsi'] = RSI(9).compute(self.data)
        self.data['macd'], self.data['signal'], self.data['diff'] = MACD(19, 36, 9).compute(self.data)
        self.data['atr'] = ATR(56).compute(self.data)
        self.data['SO'] = StochasticOscillator(self.data).compute().generate_signals()
        self.data['BB'] = BollingerBands(self.data).compute().generate_signals()

        psar = ParabolicSAR()
        for high, low in zip(self.data['high'], self.data['low']):
            psar.update(high, low)
        sar_signal = psar.get_signals(self.data.index)
        self.data['sar'] = sar_signal

        self.sma_signal = self.signals.crossover(self.data['sma50'], self.data['sma200'])
        self.rsi_signal = self.signals.threshold(self.data['rsi'], 30, 70)
        self.macd_signal = self.signals.crossover(self.data['macd'], self.data['signal'])
        self.sar_signal = self.data['sar']
        self.SO_signal = self.data['SO']
        self.BB_signal = self.data['BB']

    INDICATOR_MAPPING = {
        'BB':   {'confirmers': ['RSI', 'MACD', 'SO', 'SAR', 'EMA'], 'description': 'Bollinger Bands'},
        'RSI':  {'confirmers': ['MACD', 'BB', 'SO', 'SAR', 'EMA'],  'description': 'Relative Strength Index'},
        'MACD': {'confirmers': ['RSI', 'BB', 'SO', 'SAR', 'EMA'],   'description': 'Moving Average Convergence Divergence'},
        'SO':   {'confirmers': ['BB', 'MACD', 'RSI', 'SAR', 'EMA'], 'description': 'Stochastic Oscillator'},
        'SAR':  {'confirmers': ['MACD', 'RSI', 'SO', 'BB', 'EMA'],  'description': 'Parabolic SAR'},
        'EMA':  {'confirmers': ['MACD', 'RSI', 'SO', 'BB', 'SAR'],  'description': 'Exponnetial moving average'},
    }

    def select_indicators(self):
        print("Available indicators:")
        for idx, indicator in enumerate(self.INDICATOR_MAPPING.keys(), 1):
            print(f"{idx}. {self.INDICATOR_MAPPING[indicator]['description']} ({indicator})")

        primary = input("\nSelect primary indicator (enter number or code): ")
        primary = self._validate_selection(primary)

        if not primary:
            print("Invalid selection!")
            return

        confirmers = self.INDICATOR_MAPPING[primary]['confirmers']
        print(f"\nSuggested confirmers for {primary}:")
        for idx, confirmer in enumerate(confirmers, 1):
            print(f"{idx}. {self.INDICATOR_MAPPING[confirmer]['description']} ({confirmer})")

        selected = input("\nSelect confirmers (comma-separated numbers, or 'all'): ")
        self.confirmed_indicators = [primary] + self._parse_confirmer_selection(selected, confirmers)
        print(f"\nSelected indicators: {', '.join(self.confirmed_indicators)}")
        self._generate_combined_signals()

    def _validate_selection(self, selection):
        indicators = list(self.INDICATOR_MAPPING.keys())
        try:
            if selection.isdigit():
                return indicators[int(selection) - 1]
            return selection.upper() if selection.upper() in indicators else None
        except:
            return None

    def _parse_confirmer_selection(self, selection, confirmers):
        if selection.lower() == 'all':
            return confirmers
        if selection.lower() == '':
            return []
        try:
            selected = [s.strip().upper() for s in selection.split(',')]
            return selected
        except:
            return []

    def _generate_combined_signals(self):
        if not hasattr(self, 'confirmed_indicators'):
            print("No indicators selected!")
            return

        all_signals = []
        for indicator in self.confirmed_indicators:
            if indicator == 'BB':
                all_signals.append(self.BB_signal)
                self.data['BB_sig'] = self.BB_signal
            elif indicator == 'RSI':
                all_signals.append(self.rsi_signal)
                self.data['RSI_sig'] = self.rsi_signal
            elif indicator == 'MACD':
                all_signals.append(self.macd_signal)
                self.data['MACD_sig'] = self.macd_signal
            elif indicator == 'SO':
                all_signals.append(self.SO_signal)
                self.data['SO_sig'] = self.SO_signal
            elif indicator == 'SAR':
                all_signals.append(self.sar_signal)
                self.data['PSAR_sig'] = self.sar_signal
            elif indicator == 'EMA':
                all_signals.append(self.sma_signal)
                self.data['EMA_sig'] = self.sma_signal
            elif indicator == 'OBV':
                all_signals.append(self.obv_signal)

        dataa = self.data.copy()
        self.combined_signals = self.signals.regime_combined(dataa, self.weights)
        print("Signals generated: Primary indicator with confirmation check!")

    def generate_signals(self):
        if hasattr(self, 'combined_signals'):
            self.valid_signals = self.validator.confirm_volatility(
                self.combined_signals,
                self.data['atr'],
                threshold=0
            )
        else:
            self.valid_signals = self._default_signal_generation()

    def save_signals(self, path):
        self.combined_signals.to_csv(path, index=False)

    def run_backtest(self, stp_multiplier, tp_multiplier):
        equity = []
        All_pnl = []
        position = None
        position_log = []
        portfolio_value = self.initial_capital
        cap = portfolio_value
        Pnl = 0
        port_size = 0
        nb_trades = 0

        for i in range(len(self.data)):
            date = self.data.index[i]
            close = self.data['close'].iloc[i]
            atr = self.data['atr'].iloc[i]

            if position:
                stop_hit = (position['direction'] == 1 and self.data['close'].iloc[i] <= position['stop']) or \
                           (position['direction'] == -1 and self.data['close'].iloc[i] >= position['stop'])
                profit_hit = (position['direction'] == 1 and self.data['close'].iloc[i] >= position['take_profit']) or \
                             (position['direction'] == -1 and self.data['close'].iloc[i] <= position['take_profit'])

                if stop_hit or profit_hit or self.valid_signals.iloc[i] == -position['direction']:
                    pnl = position['size'] * (close - position['entry_price']) * position['direction']
                    Pnl += pnl
                    cap += position['direction'] * position['size'] * close
                    port_size += -position['direction'] * position['size']
                    portfolio_value = port_size * close + cap
                    position = None

            elif not position and self.valid_signals.iloc[i] != 0 and pd.notna(atr):
                direction = self.valid_signals.iloc[i]
                risk_amount = self.portfolio.risk_per_trade * portfolio_value
                position_size = int(risk_amount / (atr * self.portfolio.atr_multiplier))
                cap += -direction * position_size * close
                port_size += direction * position_size
                position = {
                    'entry_date': date,
                    'entry_price': close,
                    'size': position_size,
                    'direction': direction,
                    'stop': self.portfolio.dynamic_stop_loss(close, atr, direction, stp_multiplier),
                    'take_profit': self.portfolio.dynamic_take_profit(close, atr, direction, tp_multiplier)
                }
                portfolio_value = port_size * close + cap
                nb_trades += 1

            All_pnl.append(Pnl)
            equity.append(portfolio_value)
            position_log.append(position)

        self.results = pd.DataFrame({'Equity': equity}, index=self.data.index)
        self.position_log = position_log
        self.All_pnl = pd.DataFrame({'P&L': All_pnl}, index=self.data.index)
        self.nb_trades = nb_trades

    def analyze_performance(self):
        returns = self.results['Equity'].pct_change().dropna()
        total_return = (self.results['Equity'].iloc[-1] / self.initial_capital - 1) * 100
        max_drawdown = (self.results['Equity'] / self.results['Equity'].cummax() - 1).min() * 100
        sharpe_ratio = np.sqrt(252) * returns.mean() / returns.std()

        print(f"Rentabilité totale: {total_return:.2f}%")
        print(f"Rentabilité Annuelle: {(total_return / len(self.data)) * 360:.2f}%")
        print(f"Drawdown maximum: {max_drawdown:.2f}%")
        print(f"Ratio de Sharpe: {sharpe_ratio:.2f}")
        print(f"Nombre de trades: {self.nb_trades}")
        print(f"Last Pnl: {self.All_pnl['P&L'].iloc[-1]:.2f}")
        buy_hold_return = (self.data['close'].iloc[-1] / self.data['close'].iloc[0] - 1) * 100
        print(f"Rentabilité du Buy & Hold: {buy_hold_return:.2f}%")

        return self.results, self.position_log, self.All_pnl

    def plot_results(self):
        self.validator.plot_positions(self.data, self.valid_signals, self.position_log)


# ---------------------------------------------------------------------------
# plot_pairs  (Cell 24)
# ---------------------------------------------------------------------------

def plot_pairs(folderpath, figsize=(1400, 900), rows=4, cols=2):
    csv_files = [
        f for f in os.listdir(folderpath)
        if f.endswith('.csv') or f.endswith('.xlsx')
    ]

    fig = make_subplots(
        rows=rows,
        cols=cols,
        subplot_titles=[os.path.splitext(f)[0] for f in csv_files],
        vertical_spacing=0.15,
        horizontal_spacing=0.1
    )

    for idx, filename in enumerate(csv_files):
        file_path = os.path.join(folderpath, filename)

        if 'EUR' in filename:
            theta, eps = 0.1, 0.0165
        elif 'AUD' in filename:
            theta, eps = 0.1, 0.00336
        elif 'GBP' in filename:
            theta, eps = 0.2, 0.0005
        elif 'NZD' in filename:
            theta, eps = 0.1, 0.0027
        elif 'CAD' in filename:
            theta, eps = 0.4, 0.0168
        elif 'CHF' in filename:
            theta, eps = 0.2, 0.005
        elif 'JPY' in filename:
            theta, eps = 0.1, 1.967
        else:
            theta, eps = 0.1, 0.0165

        weights = [
            {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1},
            theta,
            eps
        ]
        bt = Backtester(weights)
        if filename.lower().endswith('.csv'):
            bt.load_data(file_path, type='csv')
        else:
            bt.load_data(file_path, type='xlsx')

        bt.precompute_indicators()
        bt.confirmed_indicators = ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']
        bt._generate_combined_signals()
        bt.generate_signals()
        bt.run_backtest(3, 3)
        results = bt.analyze_performance()

        pnl_series = results[2]['P&L']
        pnl_series.index = pd.to_datetime(pnl_series.index)

        row = (idx // cols) + 1
        col = (idx % cols) + 1

        fig.add_trace(
            go.Scatter(
                x=pnl_series.index,
                y=pnl_series.values,
                mode='lines+markers',
                line=dict(width=1),
                name=os.path.splitext(filename)[0]
            ),
            row=row,
            col=col
        )

    fig.update_layout(
        width=figsize[0],
        height=figsize[1],
        template='plotly_white',
        title_text='Backtest P&L per Asset Using Optimal Parameters',
        showlegend=False,
        margin=dict(t=80, b=50, l=50, r=50)
    )
    fig.update_xaxes(title_text='Date')
    fig.update_yaxes(title_text='P&L')
    fig.show()


# Hardcoded optimal parameters per FX pair (from plot_pairs)
OPTIMAL_PARAMS = {
    'EUR': {'theta': 0.1,  'eps': 0.0165},
    'AUD': {'theta': 0.1,  'eps': 0.00336},
    'GBP': {'theta': 0.2,  'eps': 0.0005},
    'NZD': {'theta': 0.1,  'eps': 0.0027},
    'CAD': {'theta': 0.4,  'eps': 0.0168},
    'CHF': {'theta': 0.2,  'eps': 0.005},
    'JPY': {'theta': 0.1,  'eps': 1.967},
}
