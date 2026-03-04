import os
import matplotlib.pyplot as plt
import seaborn as sns
import logging

def setup_logger(name):
    """Sets up a standardized logger for the project."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    return logging.getLogger(name)

def save_figure(fig, category, name):
    """Saves a figure to the appropriate folder in the figures directory."""
    from .config import FIGURES_DIR
    save_path = os.path.join(FIGURES_DIR, category)
    os.makedirs(save_path, exist_ok=True)
    full_path = os.path.join(save_path, f"{name}.png")
    fig.savefig(full_path, bbox_inches='tight', dpi=300)
    plt.close(fig)
    return full_path

def apply_style():
    """Applies a premium quantitative research style to plots."""
    sns.set_theme(style="darkgrid", palette="viridis")
    plt.rcParams['figure.figsize'] = (12, 6)
    plt.rcParams['axes.titlesize'] = 14
    plt.rcParams['axes.labelsize'] = 12
    plt.rcParams['font.family'] = 'sans-serif'
