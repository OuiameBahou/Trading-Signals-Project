
# Import `pandas`: Tabular time-series handling for OHLC and performance frames.
import pandas as pd
# Import `numpy`: Numerical arrays, vectorized ops, and grid construction.
import numpy as np
# Import `matplotlib.pyplot`: Plotting utilities for diagnostics.
import matplotlib.pyplot as plt
# Import `plotly.express`: Support library for this step.
import plotly.express as px
# Import `plotly.graph_objects`: Support library for this step.
import plotly.graph_objects as go
# From `plotly.subplots` bring in make_subplots to use directly without prefixes.
from plotly.subplots import make_subplots
# From `abc` bring in ABC, abstractmethod to use directly without prefixes.
from abc import ABC, abstractmethod
# From `itertools` bring in combinations to use directly without prefixes.
from itertools import combinations
# From `tqdm` bring in tqdm to use directly without prefixes.
from tqdm import tqdm
# Import `itertools`: Parameter grid generation via Cartesian products.
import itertools
# From `mpi4py` bring in MPI to use directly without prefixes.
from mpi4py import MPI
# From `collections` bring in defaultdict to use directly without prefixes.
from collections import defaultdict
# Import `copy`: Support library for this step.
import copy
# Import `warnings`: Support library for this step.
import warnings
# Import `os`: Support library for this step.
import os
warnings.filterwarnings('ignore')

class DataLoader(ABC):
    @abstractmethod
# Define function `load_data` — its arguments and return dictate optimization flow.
    def load_data(self, **kwargs):
        pass

class CSVLoader(DataLoader):
# Define function `load_data` — its arguments and return dictate optimization flow. (contextualized here).
    def load_data(self, file_path, index_col=0, type = 'csv', columns_map=None):
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
    
# Define function `_clean_data` — its arguments and return dictate optimization flow.
    def _clean_data(self, df):
        df = df.asfreq('D')
        df = df.ffill().bfill()
        df = df[~df.index.duplicated(keep='first')]
        return df

class BloombergLoader(DataLoader):
# Note: define function `load_data` — its arguments and return dictate optimization flow.
    def load_data(self, symbol, fields, start_date, end_date):
        pass

class TradingViewLoader(DataLoader):
# Define function `load_data` — its arguments and return dictate optimization flow. — see variables referenced just below.
    def load_data(self, widget):
        pass

class TechnicalIndicator(ABC):
# Define function `__init__` — its arguments and return dictate optimization flow.
    def __init__(self, window,indicator_type, source='close'):
        self.window = window
        self.indicator_type = indicator_type
        self.source = source
    
    @abstractmethod
# Define function `compute` — its arguments and return dictate optimization flow.
    def compute(self, data):
        pass

class SMA(TechnicalIndicator):
# Define function `__init__` — its arguments and return dictate optimization flow. (contextualized here).
    def __init__(self, window):
        super().__init__(window, 'trend')
# Define function `compute` — its arguments and return dictate optimization flow. (contextualized here).
    def compute(self, data):
        return data[self.source].rolling(self.window).mean()

class EMA(TechnicalIndicator):
# Note: define function `__init__` — its arguments and return dictate optimization flow.
    def __init__(self, window):
        super().__init__(window, 'trend')
# Note: define function `compute` — its arguments and return dictate optimization flow.
    def compute(self, data):
        return data[self.source].ewm(span=self.window, adjust=False).mean()

class RSI(TechnicalIndicator):
# Define function `__init__` — its arguments and return dictate optimization flow. — see variables referenced just below.
    def __init__(self, window):
        super().__init__(window, 'momentum')
# Define function `compute` — its arguments and return dictate optimization flow. — see variables referenced just below.
    def compute(self, data):
        delta = data[self.source].diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        avg_gain = gain.rolling(self.window).mean()
        avg_loss = loss.rolling(self.window).mean()
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

class MACD:
# Define function `__init__` — its arguments and return dictate optimization flow. ⇒ this affects downstream steps.
    def __init__(self, fast=12, slow=26, signal=9):
        self.indicator_type = 'trend'
        self.fast = fast
        self.slow = slow
        self.signal = signal
    
# Define function `compute` — its arguments and return dictate optimization flow. ⇒ this affects downstream steps.
    def compute(self, data):
        fast_ema = data['close'].ewm(span=self.fast, adjust=False).mean()
        slow_ema = data['close'].ewm(span=self.slow, adjust=False).mean()
        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=self.signal, adjust=False).mean()
        return macd_line, signal_line
    
class OBV(TechnicalIndicator):
# Define function `__init__` — its arguments and return dictate optimization flow. [2]
    def __init__(self,window):
        super().__init__(window,'volume')
# Define function `compute` — its arguments and return dictate optimization flow. [2]
    def compute(self, data):
        ticker_history = data.copy()
        #for i in range(0, len(ticker_history)):
        #    ticker_history["volume"][i] = float(ticker_history["volume"][i][:-1]) * 1000000
        obv = np.where(ticker_history['close'].diff() > 0, ticker_history['volume'], -ticker_history['volume'])
        return pd.Series(obv, index=ticker_history.index).cumsum()
    
    
class ParabolicSAR:
# Define function `__init__` — its arguments and return dictate optimization flow. [3]
    def __init__(self, initial_af=0.02, max_af=0.2, step=0.02):
        self.initial_af = initial_af
        self.max_af = max_af
        self.step = step
        self.reset()
# Define function `reset` — its arguments and return dictate optimization flow.
    def reset(self):
        self.trend = None    
        self.af = self.initial_af 
        self.ep = None           
        self.sar = None
        self.signals = [] 
        self.historical_sar = []
        self.prev_high = None
        self.prev_low = None
# Define function `update` — its arguments and return dictate optimization flow.
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
    
# Define function `_initialize` — its arguments and return dictate optimization flow.
    def _initialize(self, high, low):
        self.trend = 'up' if high > low else 'down'
        self.ep = high if self.trend == 'up' else low
        self.sar = low if self.trend == 'up' else high
        self.prev_high = high
        self.prev_low = low
        self.historical_sar.append(self.sar)

# Define function `_calculate_next_sar` — its arguments and return dictate optimization flow.
    def _calculate_next_sar(self):
        if self.trend == 'up':
            return self.sar + self.af * (self.ep - self.sar)
        return self.sar - self.af * (self.sar - self.ep)

# Define function `_reverse_trend` — its arguments and return dictate optimization flow.
    def _reverse_trend(self, high, low, new_sar):
        self.trend = 'down' if self.trend == 'up' else 'up'
        self.sar = self.ep 
        self.af = self.initial_af
        self.ep = low if self.trend == 'up' else high

# Define function `_continue_trend` — its arguments and return dictate optimization flow.
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

# Define function `get_signals` — its arguments and return dictate optimization flow.
    def get_signals(self, index=None):
        if index is not None and len(index) == len(self.signals):
            return pd.Series(self.signals, index=index, name='signal')
        return pd.Series(self.signals, name='signal')
    

class StochasticOscillator:
# Define function `__init__` — its arguments and return dictate optimization flow. [4]
    def __init__(self, data=None, k_period=14, d_period=3, smoothing=3):
        self.data = data
        self.k_period = k_period
        self.d_period = d_period
        self.smoothing = smoothing
        self._validate_parameters()
        
        self._k_values = None
        self._d_values = None
        self.signals = None

# Define function `_validate_parameters` — its arguments and return dictate optimization flow.
    def _validate_parameters(self):
        if self.k_period <= 0 or self.d_period <= 0:
            raise ValueError("Periods must be positive integers")
        if self.smoothing not in [1, 2, 3]:
            raise ValueError("Smoothing must be 1, 2, or 3")

# Define function `compute` — its arguments and return dictate optimization flow. [3]
    def compute(self):
        if self.data is None:
            raise ValueError("No data provided")

        low_min = self.data['low'].rolling(self.k_period).min()
        high_max = self.data['high'].rolling(self.k_period).max()
        
        k = 100 * (self.data['close'] - low_min) / (high_max - low_min)
        k = k.replace([np.inf, -np.inf], np.nan).ffill()
        
        if self.smoothing >= 1:
            k = k.rolling(self.d_period).mean()
        if self.smoothing >= 2:
            k = k.rolling(self.d_period).mean()
        if self.smoothing == 3:
            k = k.rolling(self.d_period).mean()
        
        self._k_values = k
        self._d_values = k.rolling(self.d_period).mean()
        return self

# Define function `generate_signals` — its arguments and return dictate optimization flow.
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
# Define function `__init__` — its arguments and return dictate optimization flow. [5]
    def __init__(self, data, window=20, num_std=2):
        self.data = data
        self.window = window
        self.num_std = num_std
        self.middle_band = None
        self.upper_band = None
        self.lower_band = None
        self.percent_b = None
        self.bandwidth = None
        self.signals = None

# Define function `compute` — its arguments and return dictate optimization flow. [4]
    def compute(self):
        self.middle_band = self.data['close'].rolling(self.window).mean()
        std = self.data['close'].rolling(self.window).std()
        
        self.upper_band = self.middle_band + (std * self.num_std)
        self.lower_band = self.middle_band - (std * self.num_std)
        
        band_width = self.upper_band - self.lower_band
        self.percent_b = (self.data['close'] - self.lower_band) / band_width.replace(0, np.nan)
        self.bandwidth = band_width / self.middle_band
        
        return self

# Define function `generate_signals` — its arguments and return dictate optimization flow. (contextualized here).
    def generate_signals(self, squeeze_threshold=0.5, squeeze_lookback=20):
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
class ATR:
# Define function `__init__` — its arguments and return dictate optimization flow. [6]
    def __init__(self, window=14):
        self.window = window
        self._validate_window()
        
# Define function `_validate_window` — its arguments and return dictate optimization flow.
    def _validate_window(self):
        if not isinstance(self.window, int) or self.window < 1:
            raise ValueError("Window must be positive integer")

# Define function `compute` — its arguments and return dictate optimization flow. [5]
    def compute(self, data):
        self._check_ohlc(data)
        
        tr = self._true_range(data)
        atr = self._smooth(tr)
        
        return atr.rename(f'ATR_{self.window}')

# Define function `_true_range` — its arguments and return dictate optimization flow.
    def _true_range(self, data):
        prev_close = data['close'].shift(1).ffill()
        
        tr1 = data['high'] - data['low']
        tr2 = (data['high'] - prev_close).abs()
        tr3 = (data['low'] - prev_close).abs()
        
        return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

# Define function `_smooth` — its arguments and return dictate optimization flow.
    def _smooth(self, tr):
        sma_initial = tr.rolling(self.window).mean()[:self.window]
        ema_rest = tr[self.window:].ewm(alpha=1-(1/self.window), adjust=False).mean()
        
        return pd.concat([sma_initial, ema_rest])

# Define function `_check_ohlc` — its arguments and return dictate optimization flow.
    def _check_ohlc(self, data):
        required = ['open','high', 'low', 'close']
        missing = [col for col in required if col not in data.columns]
        if missing:
            raise ValueError(f"Données OHLC manquantes : {missing}")

class SignalGenerator:
    @staticmethod
# Define function `crossover` — its arguments and return dictate optimization flow.
    def crossover(series1, series2):
        signals = pd.Series(0, index=series1.index)
        series11 = series1.copy()
        series22 = series2.copy()
        signals[(series11.shift(1) < series22.shift(1)) & (series11 > series22)] = -1
        signals[(series11.shift(1) > series22.shift(1)) & (series11 < series22)] = 1
        return signals
    
    @staticmethod
# Define function `threshold` — its arguments and return dictate optimization flow.
    def threshold(rsi_series, oversold=30, overbought=70):
        signals = pd.Series(0, index=rsi_series.index)
        signals[rsi_series < oversold] = 1
        signals[rsi_series > overbought] = -1
        return signals
    @staticmethod
# Define function `combine_signals` — its arguments and return dictate optimization flow.
    def combine_signals(signals_list, min_confirmation=2):
        combined = pd.DataFrame(signals_list).T.sum(axis=1)
        confirmation = pd.DataFrame(signals_list).T.abs().sum(axis=1)
        
        final_signal = pd.Series(0, index=combined.index)
        final_signal[(combined > 0) & (confirmation >= min_confirmation)] = 1
        final_signal[(combined < 0) & (confirmation >= min_confirmation)] = -1
        
        return final_signal

class SignalValidator:
    @staticmethod
# Define function `confirm_volatility` — its arguments and return dictate optimization flow.
    def confirm_volatility(signals, atr, threshold=1.5):
        return signals * (atr > threshold)
    
    @staticmethod
# Define function `confirm_trend` — its arguments and return dictate optimization flow.
    def confirm_trend(signals, adx, threshold=25):
        return signals * (adx > threshold)
    
    @staticmethod
# Define function `plot_signals` — its arguments and return dictate optimization flow.
    def plot_signals(data, signals):
        buy_signals = signals[signals == 1].index
        sell_signals = signals[signals == -1].index
        
        data['close'].plot(figsize=(15, 7), color='blue')
        data.loc[buy_signals, 'close'].plot(ls='', marker='^', markersize=7, color='g', label='Buy Signal')
        data.loc[sell_signals, 'close'].plot(ls='', marker='v', markersize=7, color='r', label='Sell Signal')
        plt.legend()
        plt.show()

# Define function `plot_positions` — its arguments and return dictate optimization flow.
    def plot_positions(self, data, signals,position_log):
        
        # Create plot
        plt.figure(figsize=(15, 7))
        ax = data['close'].plot(color='black', label='Close Price')
        
        # Initialize position tracking
        current_position = None
        position_start = None
        valid_positions = [p for p in position_log if p is not None]
        
# Invoke the historical simulation for the current parameter set.
        # Track actual entry points from backtest results
        actual_buy_dates = [p['entry_date'] for p in valid_positions if p['direction'] == 1]
        actual_sell_dates = [p['entry_date'] for p in valid_positions if p['direction'] == -1]

# Invoke the historical simulation for the current parameter set. (contextualized here).
        # 1. Plot validated signals from backtest
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

# Invoke this historical simulation for this current parameter set.
        # 2. Color active positions from backtest log
        current_direction = None
        position_start = None
        
        for i, pos in enumerate(position_log):
            date = data.index[i]
            
            if pos:
                # New position started
                if not current_direction:
                    current_direction = pos['direction']
                    position_start = date
            else:
                # Position closed
                if current_direction:
                    color = 'green' if current_direction == 1 else 'red'
                    ax.axvspan(position_start, data.index[i-1], 
                            color=color, alpha=0.2)
                    current_direction = None

        # Handle any open position at end
        if current_direction:
            ax.axvspan(position_start, data.index[-1],
                    color='green' if current_direction == 1 else 'red',
                    alpha=0.2)

        # 3. Original signal markers (transparent)
        data.loc[signals[signals == 1].index, 'close'].plot(
            ax=ax, ls='', marker='^', markersize=7,
            color='blue', alpha=0.3, label='Raw Buy Signals'
        )
        data.loc[signals[signals == -1].index, 'close'].plot(
            ax=ax, ls='', marker='v', markersize=7,
            color='blue', alpha=0.3, label='Raw Sell Signals'
        )

        plt.title('Price Chart with Validated Positions')
        plt.legend()
        plt.show()

class PortfolioManager:
# Define function `__init__` — its arguments and return dictate optimization flow. [7]
    def __init__(self, initial_capital, risk_per_trade=0.05, atr_multiplier=2):
        self.initial_capital = initial_capital
        self.risk_per_trade = risk_per_trade
        self.atr_multiplier = atr_multiplier
    
# Define function `calculate_position_size` — its arguments and return dictate optimization flow.
    def calculate_position_size(self, price, atr): 
        risk_amount = self.initial_capital * self.risk_per_trade
        return risk_amount / (atr * self.atr_multiplier)
    
# Define function `dynamic_stop_loss` — its arguments and return dictate optimization flow.
    def dynamic_stop_loss(self, entry_price, atr, direction,stp_multiplier):
        if direction == 1:
            return entry_price - (atr * stp_multiplier)
        else:
            return entry_price + (atr * stp_multiplier)
# Define function `dynamic_take_profit` — its arguments and return dictate optimization flow.
    def dynamic_take_profit(self, entry_price, atr, direction,tp_multiplier):
        if direction == 1:
            return entry_price + (atr * tp_multiplier)
        else:
            return entry_price - (atr * tp_multiplier)

# Note: invoke the historical simulation for the current parameter set.
class Backtester:
# Define function `__init__` — its arguments and return dictate optimization flow. [8]
    def __init__(self, initial_capital=10_000):
        self.initial_capital = initial_capital
        self.portfolio = PortfolioManager(initial_capital)
        self.data_loader = CSVLoader()
        self.signals = SignalGenerator()
        self.validator = SignalValidator()
        
# Define function `load_data` — its arguments and return dictate optimization flow. ⇒ this affects downstream steps.
    def load_data(self, file_path,type):
        if type == 'csv':
            self.data = self.data_loader.load_data(
                file_path=file_path,
                columns_map={
                    'Price': 'close',
                    'High': 'high',
                    'Low': 'low',
                    'Open': 'open',
                    'Vol.': 'volume'
                }
            ,type = type)
        elif type == 'xlsx':
            self.data = self.data_loader.load_data(
                file_path=file_path,
                columns_map={
                    'PX_LAST': 'close',
                    'PX_HIGH': 'high',
                    'PX_LOW': 'low',
                    'PX_OPEN': 'open'
                }
            ,type = type)
# Define function `precompute_indicators` — its arguments and return dictate optimization flow.
    def precompute_indicators(self):
        if self.updating == True:
        # Calcul des indicateurs techniques
            self.data['rsi'] = RSI(self.rsi_params['period']).compute(self.data)
            self.data['sma50'] = SMA(self.macd_params['fast_period']).compute(self.data)
            self.data['sma200'] = SMA(self.macd_params['slow_period']).compute(self.data)
            self.data['macd'], self.data['signal'] = MACD(self.macd_params['fast_period'],self.macd_params['slow_period'],self.macd_params['signal_period']).compute(self.data)
            self.data['atr'] = ATR(56).compute(self.data)
            self.data['SO'] = StochasticOscillator(self.data,self.so_params['k_period'],self.so_params['d_period'],self.so_params['smoothing']).compute().generate_signals()
            self.data['BB'] = BollingerBands(self.data,self.bb_params['window'],self.bb_params['num_std']).compute().generate_signals(self.bb_params['squeeze_threshold'])
            psar = ParabolicSAR(self.sar_params['initial_af'], self.sar_params['max_af'], self.sar_params['step'])
            for high, low in zip(self.data['high'], self.data['low']):
                psar.update(high, low)
            sar_signal = psar.get_signals(self.data.index)
            self.data['sar'] = sar_signal
            self.sma_signal = self.signals.crossover(self.data['sma50'], self.data['sma200'])
            self.rsi_signal = self.signals.threshold(self.data['rsi'], self.rsi_params['oversold'], self.rsi_params['overbought'])
            self.macd_signal = self.signals.crossover(self.data['macd'], self.data['signal'])
            self.sar_signal = self.data['sar']
            self.SO_signal = self.data['SO']
            self.BB_signal = self.data['BB']
            self.updating = False
        else:
            self.data['sma50'] = SMA(28).compute(self.data)
            self.data['sma200'] = SMA(56).compute(self.data)
            self.data['rsi'] = RSI(28).compute(self.data)
            self.data['macd'], self.data['signal'] = MACD(28,56,14).compute(self.data)
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
        'BB': {'confirmers': ['RSI', 'MACD', 'SO', 'SAR','EMA'], 'description': 'Bollinger Bands'},
        'RSI': {'confirmers': ['MACD', 'BB', 'SO', 'SAR','EMA'], 'description': 'Relative Strength Index'},
        'MACD': {'confirmers': ['RSI', 'BB', 'SO', 'SAR','EMA'], 'description': 'Moving Average Convergence Divergence'},
        'SO': {'confirmers': ['BB', 'MACD', 'RSI', 'SAR','EMA'], 'description': 'Stochastic Oscillator'},
        'SAR': {'confirmers': ['MACD', 'RSI', 'SO', 'BB','EMA'], 'description': 'Parabolic SAR'},
        'EMA': {'confirmers': ['MACD', 'RSI', 'SO', 'BB','SAR'], 'description': 'Exponnetial moving average'}
    }
# Define function `_default_signal_generation` — its arguments and return dictate optimization flow.
    def _default_signal_generation(self):
        # Génération des signaux bruts
        self.sma_signal = self.signals.crossover(self.data['sma50'], self.data['sma200'])
        self.rsi_signal = self.signals.threshold(self.data['rsi'], 30, 70)
        self.macd_signal = self.signals.crossover(self.data['macd'], self.data['signal'])
        self.sar_signal = self.data['sar']
        self.SO_signal = self.data['SO']
        self.BB_signal = self.data['BB']
        # Combinaison des signaux
        self.combined_signals = self.signals.combine_signals([self.rsi_signal, self.macd_signal, self.sar_signal,self.SO_signal,self.BB_signal])
        #self.validator.plot_signals(self.data, combined_signals)
        # Validation avec ATR
        self.valid_signals = self.validator.confirm_volatility(
            self.combined_signals, 
            self.data['atr'], 
            threshold=0
        )
        return self.valid_signals
# Define function `select_indicators` — its arguments and return dictate optimization flow.
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

# Define function `_validate_selection` — its arguments and return dictate optimization flow.
    def _validate_selection(self, selection):
        indicators = list(self.INDICATOR_MAPPING.keys())
        try:
            if selection.isdigit():
                return indicators[int(selection)-1]
            return selection.upper() if selection.upper() in indicators else None
        except:
            return None

# Define function `_parse_confirmer_selection` — its arguments and return dictate optimization flow.
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

# Define function `_generate_combined_signals` — its arguments and return dictate optimization flow.
    def _generate_combined_signals(self):
        if not hasattr(self, 'confirmed_indicators'):
            print("No indicators selected!")
            return

        all_signals = {}
        for indicator in self.confirmed_indicators:
            if indicator == 'BB':
                all_signals['BB'] = self.BB_signal
            elif indicator == 'RSI':
                all_signals['RSI'] = self.rsi_signal
            elif indicator == 'MACD':
                all_signals['MACD'] = self.macd_signal
            elif indicator == 'SO':
                all_signals['SO'] = self.SO_signal
            elif indicator == 'SAR':
                all_signals['SAR'] = self.sar_signal
            elif indicator == 'OBV':
                all_signals['OBV'] = self.obv_signal
            elif indicator == 'SMA':
                all_signals['SMA'] = self.sma_signal
        
        primary = self.confirmed_indicators[0]
        confirmers = self.confirmed_indicators[1:]
        self.combined_signals = pd.Series(0, index=self.data.index)
        for dt in self.data.index:
            primary_signal = all_signals[primary].get(dt, 0)
            
            if primary_signal == 0:
                # No signal from primary indicator
                self.combined_signals[dt] = 0
            else:
                # Check for confirmation if confirmers exist
                if confirmers:
                    confirm_count_agree = sum(
                        1 for confirmer in confirmers 
                        if all_signals[confirmer].get(dt, 0) == primary_signal
                    )
                    confirm_count_disaagree = sum(
                        -1 for confirmer in confirmers 
                        if all_signals[confirmer].get(dt, 0) == -primary_signal
                    )
                    confirm_count = confirm_count_agree + confirm_count_disaagree
                    # Require at least 1 confirmation
                    self.combined_signals[dt] = primary_signal if confirm_count >= 0 else 0
                else:
                    # Use primary signal directly if no confirmers
                    self.combined_signals[dt] = primary_signal

        print("Signals generated: Primary indicator with confirmation check!")
        

# Note: define function `generate_signals` — its arguments and return dictate optimization flow.
    def generate_signals(self):
        if hasattr(self, 'combined_signals'):
            self.valid_signals = self.validator.confirm_volatility(
            self.combined_signals, 
            self.data['atr'], 
            threshold=0
        )
        else:
            # Fallback to original signal generation
            self.valid_signals = self._default_signal_generation()
# Define function `run_backtest` — its arguments and return dictate optimization flow.
# Invoke the historical simulation for the current parameter set. — see variables referenced just below.
    def run_backtest(self,stp_multiplier,tp_multiplier):
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
            # Gestion de la position existante
            if position:
                stop_hit = (position['direction'] == 1 and self.data['close'].iloc[i] <= position['stop']) or \
                          (position['direction'] == -1 and self.data['close'].iloc[i] >= position['stop'])
                profit_hit = (position['direction'] == 1 and self.data['close'].iloc[i] >= position['take_profit']) or \
                            (position['direction'] == -1 and self.data['close'].iloc[i] <= position['take_profit'])
                
                if stop_hit or profit_hit or self.valid_signals.iloc[i] == -position['direction']:
                    # Fermeture de la position
                    pnl = position['size'] * (close - position['entry_price']) * position['direction']
                    Pnl += pnl
                    cap +=  position['direction']*position['size']*close
                    port_size += -position['direction']*position['size']
                    portfolio_value = port_size*close + cap
                    position = None
                    
            # Ouverture de nouvelle position
            elif not position and self.valid_signals.iloc[i] != 0:
                direction = self.valid_signals.iloc[i]
                risk_amount = self.portfolio.risk_per_trade * portfolio_value
                position_size = int(risk_amount / (atr * self.portfolio.atr_multiplier))
                cap += - direction*position_size*close
                port_size += direction*position_size
                position = {
                    'entry_date': date,
                    'entry_price': close,
                    'size': position_size,
                    'direction': direction,
                    'stop': self.portfolio.dynamic_stop_loss(close, atr, direction,stp_multiplier),
                    'take_profit': self.portfolio.dynamic_take_profit(close, atr, direction,tp_multiplier)
                }
                portfolio_value = port_size*close + cap
                nb_trades += 1
                
            All_pnl.append(Pnl)
            equity.append(portfolio_value)
            position_log.append(position)
        
        self.results = pd.DataFrame({'Equity': equity}, index=self.data.index)
        self.position_log = position_log
        self.All_pnl = pd.DataFrame({'P&L': All_pnl}, index=self.data.index)
        self.nb_trades = nb_trades
        
# Define function `analyze_performance` — its arguments and return dictate optimization flow.
    def analyze_performance(self):
        returns = self.results['Equity'].pct_change().dropna()
        total_return = (self.results['Equity'].iloc[-1]/self.initial_capital - 1)*100
# Track peak-to-trough losses to capture downside risk.
        max_drawdown = (self.results['Equity']/self.results['Equity'].cummax() - 1).min()*100
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance.
        sharpe_ratio = np.sqrt(252) * returns.mean() / returns.std()
        
        print(f"Rentabilité totale: {total_return:.2f}%")
        print(f"Rentabilité Annuelle: {(total_return/len(self.data))*252:.2f}%")
# Track peak-to-trough losses to capture downside risk. (contextualized here).
        print(f"Drawdown maximum: {max_drawdown:.2f}%")
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. (contextualized here).
        print(f"Ratio de Sharpe: {sharpe_ratio:.2f}")
        print(f"Nombre de trades: {self.nb_trades}")
        buy_hold_return = (self.data['close'].iloc[-1]/self.data['close'].iloc[0] - 1)*100
        print(f"Rentabilité du Buy & Hold: {buy_hold_return:.2f}%")
        
        return self.results,self.position_log,self.All_pnl
# Define function `plot_results` — its arguments and return dictate optimization flow.
    def plot_results(self):
        self.validator.plot_positions(self.data, self.valid_signals,self.position_log)

# Define function `result_testing` — its arguments and return dictate optimization flow.
    def result_testing(self, filename='strategy_results.xlsx'):
        """
            Test all combinations of primary indicators and confirmers,
            then save results to Excel.
        """
        results = []
        base_data = self.data.copy()
        initial_cap = self.initial_capital
        
        all_indicators = list(self.INDICATOR_MAPPING.keys())
        
        for primary in all_indicators:
            confirmers = self.INDICATOR_MAPPING[primary]['confirmers']
            
            for conf_count in range(0, 4):  # 0-3 confirmers
                for conf_combo in combinations(confirmers, conf_count):
# Invoke the historical simulation for the current parameter set. ⇒ this affects downstream steps.
                    bt = Backtester(initial_capital=initial_cap)
                    bt.data = base_data.copy()
                    bt.precompute_indicators()
                    bt.confirmed_indicators = [primary] + list(conf_combo)
                    
                    try:
                        bt._generate_combined_signals()
                        bt.generate_signals()
# Invoke the historical simulation for the current parameter set. [2]
                        bt.run_backtest()
                        
                        # Calculate performance metrics from existing data
                        equity = bt.results['Equity']
                        pnl = bt.All_pnl['P&L']
                        positions = pd.Series([p is not None for p in bt.position_log], 
                                            index=bt.data.index)
                        
                        # Total Return
                        total_return = (equity.iloc[-1] / initial_cap - 1) * 100
                        
# Note: derive Sharpe ratio from returns series to quantify risk-adjusted performance.
                        # Sharpe Ratio (assuming 252 trading days)
                        returns = equity.pct_change().dropna()
                        if len(returns) > 1:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. — see variables referenced just below.
                            sharpe = (returns.mean() / returns.std()) * (252**0.5)
                        else:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. ⇒ this affects downstream steps.
                            sharpe = 0
                        
                        # Max Drawdown
                        cummax = equity.cummax()
# Note: track peak-to-trough losses to capture downside risk.
                        drawdown = (equity - cummax) / cummax
# Track peak-to-trough losses to capture downside risk. — see variables referenced just below.
                        max_drawdown = drawdown.min() * 100
                        
                        # Win Rate and Profit Factor
                        trades = pnl.diff()[pnl.diff() != 0]
                        if len(trades) > 0:
                            win_rate = (trades > 0).mean() * 100
                            profit_factor = (trades[trades > 0].sum() / 
                                            abs(trades[trades < 0].sum()))
                        else:
                            win_rate = 0
                            profit_factor = 0
                        
                        results.append({
                            'Primary': primary,
                            'Confirmers': ', '.join(conf_combo) if conf_combo else 'None',
                            'Total Return (%)': round(total_return, 2),
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [2]
                            'Sharpe Ratio': round(sharpe, 2),
# Track peak-to-trough losses to capture downside risk. ⇒ this affects downstream steps.
                            'Max Drawdown (%)': round(max_drawdown, 2),
                            'Win Rate (%)': round(win_rate, 2),
                            'Number of Trades': self.nb_trades,
                            'Profit Factor': round(profit_factor, 2)
                        })
                        
                    except Exception as e:
                        print(f"Skipped {primary}+{conf_combo}: {str(e)}")
                        continue

        # Create and save results dataframe
        results_df = pd.DataFrame(results).sort_values(
            by=['Total Return (%)', 'Profit Factor'], 
            ascending=[False, False]
        )
        writer.close()
        writer = pd.ExcelWriter(filename, engine='xlsxwriter')
        results_df.to_excel(writer, index=False)
        
        workbook = writer.book
        worksheet = writer.sheets['Sheet1']
        
        green_format = workbook.add_format({'bg_color': '#C6EFCE'})
        red_format = workbook.add_format({'bg_color': '#FFC7CE'})
        
        worksheet.conditional_format(1, 2, len(results_df), 2, {
            'type': 'data_bar',
            'bar_color': '#63C384'
        })
        
        worksheet.conditional_format(1, 3, len(results_df), 3, {
            'type': 'cell',
            'criteria': '>=',
            'value': 1,
            'format': green_format
        })
        
        worksheet.conditional_format(1, 4, len(results_df), 4, {
            'type': 'cell',
            'criteria': '>=',
            'value': 30,
            'format': red_format
        })
        
        writer.close()
        print(f"Saved results to {filename} with {len(results_df)} combinations")    
# Define function `process_folder` — its arguments and return dictate optimization flow.
    def process_folder(self, folder_path, output_file='strategy_analysis.xlsx'):
        """
        Process all CSV files in a folder and save results to separate Excel sheets
        """
        csv_files = [f for f in os.listdir(folder_path) if f.endswith('.csv')]
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            for filename in csv_files:
                try:
                    file_path = os.path.join(folder_path, filename)
# Invoke the historical simulation for the current parameter set. [3]
                    bt = Backtester(initial_capital=self.initial_capital)
                    
                    bt.load_data(file_path)
                    bt.precompute_indicators()
                    results_df = self._run_file_testing(bt)
                    sheet_name = os.path.splitext(filename)[0][:31]
                    sheet_name = sheet_name.replace(':', '_').replace('\\', '_').replace('/', '_')
                    
                    results_df.to_excel(writer, sheet_name=sheet_name, index=False)
                    print(f"Processed {filename} -> {sheet_name}")
                    
                except Exception as e:
                    print(f"Failed to process {filename}: {str(e)}")
                    continue

        print(f"\nSaved results for {len(csv_files)} files to {output_file}")


        """Helper method to run testing for a single file"""

        results = []
# Invoke the historical simulation for the current parameter set. [4]
        base_data = backtester.data.copy()
# Invoke the historical simulation for the current parameter set. [5]
        initial_cap = backtester.initial_capital
        all_indicators = list(self.INDICATOR_MAPPING.keys())
        
        for primary in all_indicators:
            confirmers = self.INDICATOR_MAPPING[primary]['confirmers']
            
            for conf_count in range(0, 4):
                for conf_combo in combinations(confirmers, conf_count):
                    try:
# Invoke the historical simulation for the current parameter set. [6]
                        bt = copy.deepcopy(backtester)
                        bt.confirmed_indicators = [primary] + list(conf_combo)
                        
                        bt._generate_combined_signals()
                        bt.generate_signals()
# Invoke the historical simulation for the current parameter set. [7]
                        bt.run_backtest(2,1.5)
                        
                        equity = bt.results['Equity']
                        pnl = bt.All_pnl['P&L']
                        
                        positions = pd.Series([p is not None for p in bt.position_log], 
                                            index=bt.data.index)
                        
                        total_return = (equity[-1] / initial_cap - 1) * 100
                        
                        returns = equity.pct_change().dropna()
                        if len(returns) > 1:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [3]
                            sharpe = (returns.mean() / returns.std()) * (252**0.5)
                        else:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [4]
                            sharpe = 0
                        
                        cummax = equity.cummax()
# Track peak-to-trough losses to capture downside risk. [2]
                        drawdown = (equity - cummax) / cummax
# Track peak-to-trough losses to capture downside risk. [3]
                        max_drawdown = drawdown.min() * 100
                        
                        trades = pnl.diff()[pnl.diff() != 0]
                        if len(trades) > 0:
                            win_rate = (trades > 0).mean() * 100
                            profit_factor = (trades[trades > 0].sum() / 
                                            abs(trades[trades < 0].sum()))
                        else:
                            win_rate = 0
                            profit_factor = 0
                        
                        results.append({
                            'Primary': primary,
                            'Confirmers': ', '.join(conf_combo) if conf_combo else 'None',
                            'Total Return (%)': round(total_return, 2),
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [5]
                            'Sharpe Ratio': round(sharpe, 2),
# Track peak-to-trough losses to capture downside risk. [4]
                            'Max Drawdown (%)': round(max_drawdown, 2),
                            'Win Rate (%)': round(win_rate, 2),
                            'Number of Trades': self.nb_trades,
                            'Profit Factor': round(profit_factor, 2)
                        })
                        
                    except Exception as e:
                        continue

        return pd.DataFrame(results).sort_values(
            by=['Total Return (%)', 'Profit Factor'], 
            ascending=[False, False]
        )

# Define function `exhaustive_primary_combination_testing` — its arguments and return dictate optimization flow.
    def exhaustive_primary_combination_testing(self):
        """
        Test all combinations with primary + confirmers structure
        Returns DataFrame with P&L streams for all combinations
        """
        all_indicators = list(self.INDICATOR_MAPPING.keys())
        NB_trades = pd.DataFrame()
        pnl_results = pd.DataFrame(index=self.data.index)
# Invoke the historical simulation for the current parameter set. [8]
        base_backtester = copy.deepcopy(self)
        for primary in all_indicators:
            remaining = [ind for ind in all_indicators if ind != primary]
            
            # Generate all possible confirmation combinations (0-3 confirmers)
            for conf_count in range(0, len(remaining)+1):
                for confirmers in combinations(remaining, conf_count):
                    combo_name = f"{primary}+{','.join(confirmers) if confirmers else 'None'}"
                    try:
# Invoke the historical simulation for the current parameter set. [9]
                        bt = copy.deepcopy(base_backtester)
                        bt.confirmed_indicators = [primary] + list(confirmers)
                        
                        # Generate signals with primary priority
                        bt._generate_combined_signals()
                        bt.generate_signals()
# Invoke the historical simulation for the current parameter set. [10]
                        bt.run_backtest(3,1)
                        
                        # Store normalized P&L
                        pnl_results[combo_name] = bt.All_pnl['P&L']
                        NB_trades[combo_name] = [bt.nb_trades]
                        
                    except Exception as e:
                        print(f"Skipped {combo_name}: {str(e)}")
                        continue
        
        return pnl_results,NB_trades


# Define function `_generate_combined_signals` — its arguments and return dictate optimization flow. (contextualized here).
    def _generate_combined_signals(self):
        """Signal generation with primary priority and confirmation"""
        if not hasattr(self, 'confirmed_indicators') or len(self.confirmed_indicators) == 0:
            return

        primary = self.confirmed_indicators[0]
        confirmers = self.confirmed_indicators[1:]
        
        # Get primary indicator signals
        primary_signals = self._get_signals(primary)
        
        # Get confirmer signals
        confirmer_signals = pd.DataFrame({
            ind: self._get_signals(ind) for ind in confirmers
        })
        
        # Generate confirmed signals
        self.combined_signals = pd.Series(0, index=self.data.index)
        
        for idx in self.data.index:
            primary_signal = primary_signals.get(idx, 0)
            if primary_signal == 0:
                continue
                
            if confirmers:
                # Require at least 1 confirmer agreement
                confirmation = (confirmer_signals.loc[idx] == primary_signal).any()
                if confirmation:
                    self.combined_signals[idx] = primary_signal
            else:
                self.combined_signals[idx] = primary_signal

# Define function `_get_signals` — its arguments and return dictate optimization flow.
    def _get_signals(self, indicator):
        """Helper to get signals for individual indicators"""
        if indicator == 'BB':
            return self.BB_signal
        elif indicator == 'RSI':
            return self.rsi_signal
        elif indicator == 'MACD':
            return self.macd_signal
        elif indicator == 'SO':
            return self.SO_signal
        elif indicator == 'SAR':
            return self.sar_signal
        elif indicator == 'OBV':
            return self.obv_signal
            
# Define function `plot_pnl_evolution` — its arguments and return dictate optimization flow.
    def plot_pnl_evolution(self, pnl_df, strategies=None, figsize=(1000, 600)):
        """
        Interactive P&L evolution plot using Plotly Express
        Shows individual curve values on hover
        """
        # Calculate cumulative P&L
        cumulative_pnl = pnl_df[0]
        
        # Select strategies to plot
        if not strategies:
            top_strategies = cumulative_pnl.iloc[-1].nlargest(20).index.tolist()
            plot_data = cumulative_pnl[top_strategies]
        else:
            plot_data = cumulative_pnl[strategies]
        
        # Melt data for Plotly Express
        plot_data = plot_data.reset_index().melt(
            id_vars='Date', 
            var_name='Strategy', 
            value_name='Cumulative P&L'
        )

        # Create plot
        fig = px.line(
            plot_data,
            x='Date',
            y='Cumulative P&L',
            color='Strategy',
            labels={'Cumulative P&L': 'Cumulative Profit & Loss'},
            title='Strategy Performance Evolution',
            template='plotly_white',
            hover_data={'Date': '|%Y-%m-%d', 'Strategy': True},
            color_discrete_sequence=px.colors.qualitative.Plotly
        )
        
        # Customize hover template
        fig.update_traces(
            hovertemplate=(
                '<b>%{customdata[0]}</b><br>'
                'Date: %{x|%Y-%m-%d}<br>'
                'Cumulative P&L: %{y:$,.2f}<extra></extra>'
            )
        )
        
        # Update layout for individual curve hovering
        fig.update_layout(
            hovermode='closest',
            width=figsize[0],
            height=figsize[1],
            xaxis=dict(
                title='Date',
                gridcolor='lightgrey',
                rangeslider=dict(visible=True),
                rangeselector=dict(
                    buttons=list([
                        dict(count=1, label="1m", step="month", stepmode="backward"),
                        dict(count=6, label="6m", step="month", stepmode="backward"),
                        dict(count=1, label="YTD", step="year", stepmode="todate"),
                        dict(count=1, label="1y", step="year", stepmode="backward"),
                        dict(step="all")
                    ])
                )
            ),
            yaxis=dict(
                title='Cumulative P&L',
                gridcolor='lightgrey',
                tickprefix='$'
            ),
                legend=dict(
            title=dict(text='<b>Strategies</b>'),
            orientation='v',
            yanchor='middle',
            xanchor='left',
            x=1.02,  # Position legend outside plot area to the right
            y=0.5,    # Center vertically
            bordercolor='lightgrey',
            borderwidth=1,
            font=dict(
                family='Arial',
                size=12,
                color='black'
            ),
            itemsizing='constant'
        ),
        margin=dict(l=80, r=150, t=80, b=80) 
        )
        return fig
# Define function `plot_multiasset_pnl_evolution` — its arguments and return dictate optimization flow.
    def plot_multiasset_pnl_evolution(self, folder_path, figsize=(1400, 900), rows=3, cols=2):
        """
        Plot P&L evolution for all assets in a folder using subplots
        """
        csv_files = [f for f in os.listdir(folder_path) if f.endswith('.csv')]
        num_assets = len(csv_files)
        
        # Create dynamic subplot grid
        rows = max(rows, num_assets)
        cols = max(cols, num_assets//rows + 1)
        fig = make_subplots(
            rows=rows, 
            cols=cols,
            subplot_titles=[os.path.splitext(f)[0] for f in csv_files],
            vertical_spacing=0.15,
            horizontal_spacing=0.1
        )

        for idx, filename in enumerate(csv_files):
            try:
                # Process each asset
                file_path = os.path.join(folder_path, filename)
# Invoke the historical simulation for the current parameter set. [11]
                bt = Backtester(initial_capital=self.initial_capital)
                bt.load_data(file_path)
                bt.precompute_indicators()
                pnl_df = bt.exhaustive_primary_combination_testing()
                
                # Get top strategy for this asset
                cumulative_pnl = pnl_df
                top_strategy = cumulative_pnl.iloc[-1].idxmax()
                strategy_pnl = cumulative_pnl[top_strategy]
                # Calculate subplot position
                row = (idx // cols) + 1
                col = (idx % cols) + 1

                # Add to subplot
                fig.add_trace(
# Scatter splits an iterable into chunks and hands each rank a distinct piece.
                    go.Scatter(
                        x=strategy_pnl.index,
                        y=strategy_pnl,
                        name=os.path.splitext(filename)[0],
                        line=dict(width=1),
                        hovertemplate=
                            '<b>%{fullData.name}</b><br>' +
                            'Date: %{x|%Y-%m-%d}<br>' +
                            'P&L: %{y:$,.2f}<extra></extra>'
                    ),
                    row=row,
                    col=col
                )

                # Format subplot
                fig.update_xaxes(
                    title_text="Date",
                    row=row,
                    col=col,
                    showgrid=False
                )
                fig.update_yaxes(
                    title_text="Cumulative P&L",
                    row=row,
                    col=col,
                    tickprefix="$"
                )

            except Exception as e:
                print(f"Skipped {filename}: {str(e)}")
                continue

        # Update overall layout
        fig.update_layout(
            height=figsize[1],
            width=figsize[0],
            template='plotly_white',
            showlegend=False,
            margin=dict(t=50, b=50),
            title_text="Multi-Asset Strategy Performance",
            title_x=0.5
        )

        return fig

# Define function `plot_multiasset_top_strategies` — its arguments and return dictate optimization flow.
    def plot_multiasset_top_strategies(self, folder_path, top_n=10, figsize=(1400, 900), rows=3, cols=2):
        """
        Plot top N strategies for multiple assets with shared legend
        """
        csv_files = [f for f in os.listdir(folder_path) if f.endswith('.csv')]
        num_assets = len(csv_files)
        
        # Create dynamic subplot grid
        rows = min(rows, num_assets)
        cols = min(cols, num_assets//rows + 1)
        fig = make_subplots(
            rows=rows, 
            cols=cols,
            subplot_titles=[os.path.splitext(f)[0] for f in csv_files],
            vertical_spacing=0.15,
            horizontal_spacing=0.1
        )
        
        # Color management
        colors = px.colors.qualitative.Dark24
        color_map = {}
        color_index = 0
        
        # First pass: collect all unique strategies
        all_strategies = set()
        all_indicators = list(self.INDICATOR_MAPPING.keys())
        for primary in all_indicators:
            remaining = [ind for ind in all_indicators if ind != primary]
            
            for conf_count in range(0, len(remaining)+1):
                for confirmers in combinations(remaining, conf_count):
                    combo_name = f"{primary}+{','.join(confirmers) if confirmers else 'None'}"
                    all_strategies.add(combo_name)
        # Assign colors to all unique strategies
        color_map = {strat: colors[i % len(colors)] for i, strat in enumerate(all_strategies)}
        for idx, filename in enumerate(csv_files):
            try:
                file_path = os.path.join(folder_path, filename)
# Invoke the historical simulation for the current parameter set. [12]
                bt = Backtester(initial_capital=self.initial_capital)
                bt.load_data(file_path)
                bt.precompute_indicators()
                pnl_df,trads = bt.exhaustive_primary_combination_testing()
                cumulative_pnl = pnl_df
                top_strategies = cumulative_pnl.iloc[-1].nlargest(top_n).index.tolist()
                row = (idx // cols) + 1
                col = (idx % cols) + 1
                
# Track peak-to-trough losses to capture downside risk. [5]
                max_drawdown = (cumulative_pnl/cumulative_pnl.cummax() - 1).min()*100
                wk = len(cumulative_pnl.index)//5
                for strat in top_strategies:
                    fig.add_trace(
# Scatter splits an iterable into chunks and hands each rank a distinct piece. (contextualized here).
                        go.Scatter(
                            x=cumulative_pnl.index,
                            y=cumulative_pnl[strat],
                            name=strat,

                            line=dict(color=color_map[strat], width=1),
                            legendgroup=strat,
                            showlegend=(idx == 0),
                            hovertemplate=(
                                'Strategy: <b>%{fullData.name}</b><br>'
                                'Asset: %{meta[0]}<br>'
                                'Date: %{x|%Y-%m-%d}<br>'
                                'Weekly trade frequency: %{meta[1]:.2f}<br>'
                                'Max Drawdown: %{meta[2]:.2f}<br>'
                                'P&L: %{y:$,.2f}<extra></extra>'
                            ),
# Track peak-to-trough losses to capture downside risk. [6]
                            meta=[os.path.splitext(filename)[0],trads[strat]/wk,max_drawdown[strat]]
                        ),
                        row=row,
                        col=col
                    )
                
                # Format subplot
                fig.update_xaxes(
                    title_text="Date",
                    row=row,
                    col=col,
                    showgrid=False
                )
                fig.update_yaxes(
                    title_text="P&L",
                    row=row,
                    col=col,
                    tickprefix="$"
                )
                
            except Exception as e:
                print(f"Skipped {filename}: {str(e)}")
                continue
        
        # Update layout with unified legend
        fig.update_layout(
            height=figsize[1],
            width=figsize[0],
            template='plotly_white',
            margin=dict(t=50, b=50),
            legend=dict(
                title=dict(text='<b>Strategies</b>'),
                orientation='v',
                yanchor='top',
                xanchor='left',
                x=1.02,
                y=1.02,
                itemwidth=30
            ),
            title_text="Multi-Asset Strategy Performance (Top 20 per Asset)",
            title_x=0.5
        )
        
        return fig
# Define function `evaluate_strategies_v2` — its arguments and return dictate optimization flow.
    def evaluate_strategies_v2(self, folder_path):
        """
        Evaluate strategies using existing exhaustive_primary_combination_testing
        Returns:
            - individual_rankings: Dict {asset: DataFrame}
            - combined_ranking: DataFrame
        """
        individual_rankings = {}
        combined_scores = defaultdict(list)
        
        for filename in os.listdir(folder_path):
            if filename.endswith('.csv'):
                file_path = os.path.join(folder_path, filename)
                asset_name = os.path.splitext(filename)[0]
                
                # Generate all combinations and PnLs
                self.load_data(file_path)
                self.precompute_indicators()
                pnl_df,trads = self.exhaustive_primary_combination_testing()
                # Calculate metrics
                metrics_df = self._calculate_metrics_from_pnl(pnl_df)
                ranked_df = self._normalize_and_rank(metrics_df)
                
                individual_rankings[asset_name] = ranked_df
                self._update_combined_scores(combined_scores, ranked_df)
        
        return individual_rankings, self._create_combined_ranking(combined_scores)

# Define function `_calculate_metrics_from_pnl` — its arguments and return dictate optimization flow.
    def _calculate_metrics_from_pnl(self, pnl_df):
        """Calculate performance metrics from PnL DataFrame"""
        metrics = []
        for strategy in pnl_df.columns:
            pnl_series = pnl_df[strategy]
            
            # Cumulative PnL
            total_pnl = pnl_series[-1]
            # Max Drawdown
            cumulative = pnl_series
            peak = cumulative.expanding(min_periods=1).max()
# Track peak-to-trough losses to capture downside risk. [7]
            drawdown = (cumulative - peak)/peak.where(peak != 0, 1)
# Track peak-to-trough losses to capture downside risk. [8]
            max_dd = drawdown.min()
            
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [6]
            # Sharpe Ratio
            #returns = pnl_series / self.initial_capital
            returns = pnl_series.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0)
            if returns.std() == 0:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [7]
                sharpe = 0
            else:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [8]
                sharpe = (returns.mean()/ returns.std()) * np.sqrt(252)
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [9]
            if sharpe == np.nan:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [10]
                sharpe = 0
            metrics.append({
                'strategy': strategy,
                'pnl': total_pnl,
# Track peak-to-trough losses to capture downside risk. [9]
                'max_drawdown': max_dd,
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [11]
                'sharpe_ratio': sharpe
            })
            
        return pd.DataFrame(metrics)

# Define function `_normalize_and_rank` — its arguments and return dictate optimization flow.
    def _normalize_and_rank(self, metrics_df):
        """Normalize metrics and calculate scores"""
        # Handle negative PnL
        metrics_df['pnl'] = metrics_df['pnl'].clip(lower=0)
        
        # Normalization
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [12]
# Track peak-to-trough losses to capture downside risk. [10]
        for col, weight in [('pnl', 0.6), ('max_drawdown', 0.2), ('sharpe_ratio', 0.2)]:
            min_val = metrics_df[col].min()
            max_val = metrics_df[col].max()
            span = max_val - min_val
            
            metrics_df[f'{col}_score'] = weight * (metrics_df[col] - min_val)/span
                
        metrics_df['total_score'] = (metrics_df['pnl_score'] + 
# Track peak-to-trough losses to capture downside risk. [11]
                                    metrics_df['max_drawdown_score'] + 
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [13]
                                    metrics_df['sharpe_ratio_score'])
        return metrics_df.sort_values('total_score', ascending=False).reset_index(drop=True)

# Define function `_update_combined_scores` — its arguments and return dictate optimization flow.
    def _update_combined_scores(self, combined_scores, ranked_df):
        """Update combined scores with normalized values"""
        for _, row in ranked_df.iterrows():
            combined_scores[row['strategy']].append(row['total_score'])

# Define function `_create_combined_ranking` — its arguments and return dictate optimization flow.
    def _create_combined_ranking(self, combined_scores):

        """Create final combined ranking"""
        combined_df = pd.DataFrame([
            {'strategy': k, 'average_score': np.nanmean(v)}
            for k, v in combined_scores.items()
        ])
        return combined_df.sort_values('average_score', ascending=False).reset_index(drop=True)


# Define function `update_indicator_params` — its arguments and return dictate optimization flow.
    def update_indicator_params(self, indicator, params):
        """Update parameters for specific indicator"""
        self.updating = True
        if indicator == 'RSI':
            self.rsi_params = params
        if indicator == 'BB':
            self.bb_params = params
        if indicator == 'MACD':
            self.macd_params = params
        if indicator == 'SO':
            self.so_params = params
        if indicator == 'SAR':
            self.sar_params = params

# Define function `get_indicator_params` — its arguments and return dictate optimization flow.
    def get_indicator_params(self, indicator):
        """Get current parameters for indicator"""
        if indicator == 'RSI':
            return getattr(self, 'rsi_params', {})
        if indicator == 'BB':
            return getattr(self, 'bb_params', {})
        if indicator == 'MACD':
            return getattr(self, 'macd_params', {})
        if indicator == 'SO':
            return getattr(self, 'so_params', {})
        if indicator == 'SAR':
            return getattr(self, 'sar_params', {})


param_grid = {
    'RSI': {
        'period': [9, 14, 28, 35],
        'overbought': [70],
        'oversold': [30]
    },
    
    'MACD': {
        'fast_period': [12,19,30],
        'slow_period': [26, 30, 36],
        'signal_period': [9, 14, 28, 35]
    },

    'BB': {
        'window': [14, 30, 38],
        'num_std': [2.0, 2.5],
        'squeeze_threshold': [0.2, 0.3] 
    },
    
    'SAR': {
        'initial_af': [0.01, 0.02],
        'max_af': [0.2],
        'step': [0.01] 
    },
    
    'SO': {
        'k_period': [14],
        'd_period': [5],
        'smoothing': [1, 2]
    }
}

class StrategyOptimizer:
# Define function `__init__` — its arguments and return dictate optimization flow. [9]
# Invoke the historical simulation for the current parameter set. [13]
    def __init__(self, backtester, param_grid):
        """
        Parameters:
# Invoke the historical simulation for the current parameter set. [14]
        backtester (Backtester): Preconfigured backtester instance
        param_grid (dict): Dictionary of parameter ranges in format:
            {
                'indicator_name': {
                    'param1': [val1, val2],
                    'param2': [val3, val4]
                }
            }
        """
# Invoke the historical simulation for the current parameter set. [15]
        self.base_backtester = backtester
        self.param_grid = param_grid
        self.results = []
        self._validate_param_grid()

# Define function `_validate_param_grid` — its arguments and return dictate optimization flow.
    def _validate_param_grid(self):
# Invoke the historical simulation for the current parameter set. [16]
        """Ensure parameter grid matches backtester indicators"""
# Invoke the historical simulation for the current parameter set. [17]
        valid_indicators = self.base_backtester.INDICATOR_MAPPING.keys()
        for indicator in self.param_grid:
            if indicator not in valid_indicators:
                raise ValueError(f"Invalid indicator {indicator} in param grid")

# Define function `optimize` — its arguments and return dictate optimization flow.
    def optimize(self, top_n=5, max_combinations=10_000):
        """
        Run optimization and return top parameter sets
        Returns DataFrame with columns:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [14]
# Track peak-to-trough losses to capture downside risk. [12]
        [params, pnl, max_drawdown, sharpe_ratio, total_score]
        """
        param_combinations = self._generate_combinations()
        #print(f"Generated {len(param_combinations)} combinations")
        # Limit combinations if needed
        if len(param_combinations) > max_combinations:
            param_combinations = param_combinations[:max_combinations]
            print(f"Testing first {max_combinations} combinations")
        results = []
        for params in tqdm(param_combinations, desc="Optimizing"):
            try:
# Invoke the historical simulation for the current parameter set. [18]
                bt = self._create_backtester_with_params(params)
# Invoke the historical simulation for the current parameter set. [19]
                metrics = self._evaluate_backtester(bt)
                results.append(metrics)
            except Exception as e:
                print(f"Skipped {params}: {str(e)}")
                continue

        return self._process_results(results, top_n)

# Define function `_generate_combinations` — its arguments and return dictate optimization flow.
    def _generate_combinations(self):
        """Generate all possible parameter combinations"""
        """combinations = []
        for indicator, params in self.param_grid.items():
            indicator_combs = []
            for param, values in params.items():
                indicator_combs.append([(indicator, param, v) for v in values])
# Enumerate all parameter combinations via Cartesian product.
            combinations += list(itertools.product(*indicator_combs))
        return combinations"""
        all_param_sets = []
        
        # Create parameter sets for each indicator
        for indicator, params in self.param_grid.items():
            indicator_params = []
            for param, values in params.items():
                indicator_params.append([(indicator, param, v) for v in values])
            
            # Create product of all parameters for this indicator
# Enumerate all parameter combinations via Cartesian product. (contextualized here).
            indicator_combinations = list(itertools.product(*indicator_params))
            all_param_sets.append(indicator_combinations)
        
        # Create cross-product across all indicators
# Note: enumerate all parameter combinations via Cartesian product.
        return list(itertools.product(*all_param_sets))

# Define function `_create_backtester_with_params` — its arguments and return dictate optimization flow.
# Invoke the historical simulation for the current parameter set. [20]
    def _create_backtester_with_params(self, params):
# Invoke the historical simulation for the current parameter set. [21]
        """Create backtester instance with specific parameters"""
# Invoke the historical simulation for the current parameter set. [22]
        bt = copy.deepcopy(self.base_backtester)
        
        # Update parameters
        param_dict = {}
        for indicator_group in params:
            for (indicator, param, value) in indicator_group:
                if indicator not in param_dict:
                    param_dict[indicator] = {}
                param_dict[indicator][param] = value
        
# Invoke the historical simulation for the current parameter set. [23]
        # Update backtester with all parameters
        for indicator, params in param_dict.items():
            bt.update_indicator_params(indicator, params)
        
        return bt

# Define function `_evaluate_backtester` — its arguments and return dictate optimization flow.
# Invoke the historical simulation for the current parameter set. [24]
    def _evaluate_backtester(self, bt):
# Invoke the historical simulation for the current parameter set. [25]
        """Run backtest and return metrics"""
        bt.precompute_indicators()
        bt.generate_signals()
# Invoke the historical simulation for the current parameter set. [26]
        bt.run_backtest(3,1)        
        
        equity = bt.results['Equity']
        pnl_series = bt.All_pnl['P&L']


        # Calculate metrics
        total_pnl = pnl_series[-1]
        
        peak = equity.expanding(min_periods=1).max()
# Track peak-to-trough losses to capture downside risk. [13]
        drawdown = (equity - peak) / peak
# Track peak-to-trough losses to capture downside risk. [14]
        max_dd = drawdown.min()
        
        daily_returns = pnl_series.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0)
        if len(daily_returns) > 1 and daily_returns.std() != 0:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [15]
            sharpe = (daily_returns.mean() / daily_returns.std()) * np.sqrt(252)
        else:
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [16]
            sharpe = 0
            
        return {
            'params': self._format_params(bt),
            'pnl': total_pnl,
# Track peak-to-trough losses to capture downside risk. [15]
            'max_drawdown': max_dd,
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [17]
            'sharpe_ratio': sharpe
        }

# Define function `_format_params` — its arguments and return dictate optimization flow.
    def _format_params(self, bt):
        """Format parameters for display"""
        params = []
        for indicator in self.param_grid:
            params.append(f"{indicator}: {bt.get_indicator_params(indicator)}")
        return "\n".join(params)

# Define function `_process_results` — its arguments and return dictate optimization flow.
    def _process_results(self, results, top_n):
        """Normalize and score results"""
        df = pd.DataFrame(results)

        # Normalization
        df['pnl_norm'] = (df['pnl'] - df['pnl'].min()) / (df['pnl'].max() - df['pnl'].min())
# Track peak-to-trough losses to capture downside risk. [16]
        df['dd_norm'] = 1 - (df['max_drawdown'] - df['max_drawdown'].min()) / \
                       (df['max_drawdown'].max() - df['max_drawdown'].min())
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [18]
        df['sharpe_norm'] = (df['sharpe_ratio'] - df['sharpe_ratio'].min()) / \
                           (df['sharpe_ratio'].max() - df['sharpe_ratio'].min())
        
        # Apply penalties
        df['pnl_score'] = df['pnl_norm'].where(df['pnl'] >= 0, df['pnl_norm'] * 0.3) * 0.6
        df['dd_score'] = df['dd_norm'] * 0.2
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [20]
        df['sharpe_score'] = df['sharpe_norm'].where(df['sharpe_ratio'] >= 0, df['sharpe_norm'] * 0.5) * 0.2
        
# Derive Sharpe ratio from returns series to quantify risk-adjusted performance. [21]
        df['total_score'] = df['pnl_score'] + df['dd_score'] + df['sharpe_score']
        
        return df.sort_values('pnl', ascending=False).head(top_n)
# Define function `calculate_parameter_sensitivity` — its arguments and return dictate optimization flow.
def calculate_parameter_sensitivity(optimization_results):
    
    # Convert results to DataFrame
    df = pd.DataFrame(optimization_results)
    
    # Extract parameters into columns
    param_cols = []
    for params_str in df['params']:
        params = {}
        for line in params_str.split('\n'):
            if ': ' in line:
                indicator, param_str = line.split(': ', 1)
                param_dict = eval(param_str)
                for k, v in param_dict.items():
                    col_name = f"{indicator}_{k}"
                    params[col_name] = v
        param_cols.append(params)
    
    params_df = pd.DataFrame(param_cols)
    full_df = pd.concat([df, params_df], axis=1)
    
    sensitivity_data = []
    
    # Analyze each parameter
    for col in params_df.columns:
        if '_' in col:
            indicator, param = col.split('_', 1)
            
            # Calculate parameter value distributions
            param_stats = full_df.groupby(col).agg({
                'total_score': ['mean', 'std'],
                'pnl': ['mean', 'std']
            }).reset_index()
            
            if len(param_stats) > 1:
                # Score sensitivity (max - min of means)
                score_range = (param_stats[('total_score', 'mean')].max() 
                            - param_stats[('total_score', 'mean')].min())
                
                # PnL sensitivity (max - min of means)
                pnl_range = (param_stats[('pnl', 'mean')].max()
                        - param_stats[('pnl', 'mean')].min())
                
                sensitivity_data.append({
                    'indicator': indicator,
                    'parameter': param,
                    'score_sensitivity': score_range,
                    'pnl_sensitivity': pnl_range
                })
    
    sensitivity_df = pd.DataFrame(sensitivity_data)
    
    return sensitivity_df.sort_values('score_sensitivity', ascending=False)

class ParallelStrategyOptimizer(StrategyOptimizer):
# Define function `__init__` — its arguments and return dictate optimization flow. [10]
# Invoke the historical simulation for the current parameter set. [27]
    def __init__(self, backtester, param_grid):
# Invoke the historical simulation for the current parameter set. [28]
        super().__init__(backtester, param_grid)
# Initialize the world communicator; all ranks will participate.
        self.comm = MPI.COMM_WORLD
# Fetch this worker's `rank` ID to decide its slice of work and I/O behavior.
        self.rank = self.comm.Get_rank()
# Query the total `size` (number of processes) to compute how to split tasks.
        self.size = self.comm.Get_size()

# Define function `optimize` — its arguments and return dictate optimization flow. (contextualized here).
    def optimize(self, top_n=5, max_combinations=1000):
        """MPI-parallelized optimization"""
        if self.rank == 0:
            param_combinations = self._generate_combinations()
            if len(param_combinations) > max_combinations:
                param_combinations = param_combinations[:max_combinations]
                print(f"Testing All {len(param_combinations)} combinations")
            
            # Split combinations into chunks
# Slice the full parameter list into roughly equal pieces for distribution.
            arr = np.array(list(param_combinations), dtype=object)  # force object array
            chunks = [ck.tolist() for ck in np.array_split(arr, self.size)]
        else:
            chunks = None

        # Scatter workloads
# Note: scatter splits an iterable into chunks and hands each rank a distinct piece.
        local_combinations = self.comm.scatter(chunks, root=0)

        # Local computation with progress bar only on root
        local_results = []
        if self.rank == 0:
            iterator = tqdm(local_combinations, desc="Optimizing")
        else:
            iterator = local_combinations
            
        for params in iterator:
            #try:
# Invoke the historical simulation for the current parameter set. [29]
                bt = self._create_backtester_with_params(params)
# Invoke the historical simulation for the current parameter set. [30]
                metrics = self._evaluate_backtester(bt)
                local_results.append(metrics)
                """except Exception as e:
                if self.rank == 0:
                    print(f"Skipped {params}: {str(e)}")"""

        # Gather results
# Gather collects partial results from all ranks back on the root process.
        all_results = self.comm.gather(local_results, root=0)

        # Final processing on root
        if self.rank == 0:
            combined = [item for sublist in all_results for item in sublist]
            return self._process_results(combined, top_n)
        return None

# Define function `calculate_parameter_sensitivity` — its arguments and return dictate optimization flow. (contextualized here).
    def calculate_parameter_sensitivity(optimization_results):
        """Only run on root process"""
        if self.rank == 0:
            return calculate_parameter_sensitivity(optimization_results)
        return None
# Define function `save_res` — its arguments and return dictate optimization flow.
    def save_res(self, df):
        if self.rank == 0:
# Write tabular results to disk — prefer root-only writes under MPI.
            df.to_csv('Params.csv',index=False)
# Define function `save_sens` — its arguments and return dictate optimization flow.
    def save_sens(self, df):
        if self.rank == 0:
# Write tabular results to disk — prefer root-only writes under MPI. (contextualized here).
            df.to_csv('Sensi.csv',index=False)



# Invoke the historical simulation for the current parameter set. [31]
base_bt = Backtester(initial_capital=10_000)
base_bt.load_data(r'c:\Users\info\Downloads\trading_signals_project\data\fx\AUD_USD.csv', type = 'csv')
# Initialize MPI-aware optimizer
mpi_optimizer = ParallelStrategyOptimizer(base_bt, param_grid)

# Run optimization
results = mpi_optimizer.optimize(top_n=1000, max_combinations=1000)
mpi_optimizer.save_res(results)
# Calculate sensitivity (automatically on root)+
if results is not None:
    sensitivity = calculate_parameter_sensitivity(results)
    mpi_optimizer.save_sens(sensitivity)
    print(results.head())
    print("\n")
    print(sensitivity.head())
