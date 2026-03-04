from src.data_loader import DataLoader
from src.static_analysis import StaticAnalysis
from src.dynamic_analysis import DynamicAnalysis
from src.leadership_detection import LeadershipDetection
from src.utils import setup_logger, apply_style

logger = setup_logger("Main")

def run_phase_1():
    """Executes Step 1: Data Engineering."""
    logger.info("--- Starting Phase 1: Data Engineering ---")
    loader = DataLoader()
    prices, returns = loader.run_all()
    logger.info(f"Phase 1 complete. Prices shape: {prices.shape}")
    return prices, returns

def run_phase_2(prices, returns):
    """Executes Step 2: Static Analysis."""
    logger.info("--- Starting Phase 2: Static Analysis ---")
    analyzer = StaticAnalysis(prices, returns)
    analyzer.run_all()
    logger.info("Phase 2 complete.")

def run_phase_3(prices, returns):
    """Executes Step 3: Dynamic & Causal Analysis."""
    logger.info("--- Starting Phase 3: Dynamic Analysis ---")
    dyn_analyzer = DynamicAnalysis(prices, returns)
    dyn_analyzer.run_all()
    logger.info("Phase 3 complete.")

import subprocess

def run_phase_4(prices, returns):
    """Executes Step 4: Leadership Hub & Regime Detection (Rigorous)."""
    logger.info("--- Starting Phase 4: Leadership Detection (Rigorous Hub) ---")
    detector = LeadershipDetection(prices, returns)
    # This now runs the all-pairs discovery engine systematically
    detector.run_all(correlation_threshold=0.3)
    
    # Run the pair recollection script
    logger.info("Recollecting and unifying all pairs statistics...")
    try:
        subprocess.run(["python", "clean_daily_stats.py"], check=True)
    except Exception as e:
        logger.error(f"Failed to recollect daily stats: {e}")
        
    logger.info("Phase 4 complete.")

if __name__ == "__main__":
    apply_style()
    p, r = run_phase_1()
    run_phase_2(p, r)
    run_phase_3(p, r)
    run_phase_4(p, r)
