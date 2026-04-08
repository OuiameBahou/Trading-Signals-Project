import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LeadershipNetwork from './pages/LeadershipNetwork';
import CorrelationMatrix from './pages/CorrelationMatrix';
import AssetDirectory from './pages/AssetDirectory';
import SignalScanner from './pages/SignalScanner';
import MarketRegimes from './pages/MarketRegimes';
import TradingSignals from './pages/TradingSignals';
import FxCommandCenter from './pages/FxCommandCenter';
import FxBacktestRunner from './pages/FxBacktestRunner';
import FxCombinationExplorer from './pages/FxCombinationExplorer';
import FxParamOptimizer from './pages/FxParamOptimizer';
import FxRegimeOptimizer from './pages/FxRegimeOptimizer';
import FxMultiAssetDashboard from './pages/FxMultiAssetDashboard';
import PlatformGateway from './pages/PlatformGateway';

const App = () => {
  const [activePage, setActivePage] = useState('gateway');
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const response = await axios.get('/api/summary_stats');
        const data = response.data;
        setSummary(data?.official_pairs !== undefined ? data : (data?.value || data));
      } catch (error) {
        console.error('Failed to fetch summary statistics:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSummary();
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard summary={summary} isLoading={isLoading} onNavigate={setActivePage} />;
      case 'asset-directory': return <AssetDirectory />;
      case 'network': return <LeadershipNetwork />;
      case 'correlation': return <CorrelationMatrix />;
      case 'signals': return <SignalScanner />;
      case 'market-regimes': return <MarketRegimes />;
      case 'trading-signals': return <TradingSignals />;
      case 'fx-command': return <FxCommandCenter />;
      case 'fx-backtest': return <FxBacktestRunner />;
      case 'fx-combination': return <FxCombinationExplorer />;
      case 'fx-param-opt': return <FxParamOptimizer />;
      case 'fx-regime-opt': return <FxRegimeOptimizer />;
      case 'fx-multi-asset': return <FxMultiAssetDashboard />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2 uppercase tracking-widest">Section under development</h3>
              <p>Requested analytics module is being synchronized.</p>
            </div>
          </div>
        );
    }
  };

  if (activePage === 'gateway') {
    return <PlatformGateway onNavigate={setActivePage} />;
  }

  return (
    <Layout activePage={activePage} onNavigate={setActivePage} summary={summary}>
      {renderPage()}
    </Layout>
  );
};

export default App;
