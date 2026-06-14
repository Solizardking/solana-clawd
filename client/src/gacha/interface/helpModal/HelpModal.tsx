import useGame from '../../stores/store';
import './style.css';

const HelpModal = () => {
  const { setModal, showBars, toggleBars } = useGame((state) => state);

  const close = () => setModal(false);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Help">
      {/* Invisible backdrop button — closes on click */}
      <button type="button" className="modal-backdrop" onClick={close} aria-label="Close help" />

      <div className="modal-box">
        <button type="button" className="modal-close-btn" onClick={close} aria-label="Close">✕</button>

        <div className="modal-main">
          <div className="modal-text">
            Click PULL CAPSULE or press SPACE to spin the lobster gacha machine.
          </div>
          <div className="modal-text">
            Lobster Gacha pays shell credits when prize capsules match from left to right.
            Win CLAWD tokens, Metaplex Core NFTs, and digital prizes.
          </div>
          <div className="modal-text">Click and drag to rotate the 3D view</div>

          <div id="paytable">
            <div className="modal-text"><span>🦞 Abyss Lobster x3 pays 120 </span><img className="modal-image" src="./images/coin.png" alt="coin" /></div>
            <div className="modal-text"><span>🦀 Neon Claw x3 pays 45 </span><img className="modal-image" src="./images/coin.png" alt="coin" /></div>
            <div className="modal-text"><span>🎟 Coral Ticket x3 pays 18 </span><img className="modal-image" src="./images/coin.png" alt="coin" /></div>
            <div className="modal-text"><span>🪸 Pearl Kernel x3 pays 12 </span><img className="modal-image" src="./images/coin.png" alt="coin" /></div>
            <div className="modal-text"><span>🦞 Abyss Lobster x2 pays 80 </span><img className="modal-image" src="./images/coin.png" alt="coin" /></div>
            <div className="modal-text"><span>🦀 Neon Claw x2 pays 24 </span><img className="modal-image" src="./images/coin.png" alt="coin" /></div>
            <div className="modal-text"><span>🎟 Coral Ticket x2 pays 9 </span><img className="modal-image" src="./images/coin.png" alt="coin" /></div>
          </div>

          <button type="button" onClick={toggleBars}>
            {showBars ? 'Hide' : 'Show'} Bars
          </button>

          <div>
            <div>
              <a className="modal-link" href="https://lobstergacha.fun" target="_blank" rel="noopener noreferrer">
                lobstergacha.fun
              </a>
            </div>
            <div id="source">
              <a className="modal-source modal-link" href="https://solscan.io/token/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump" target="_blank" rel="noopener noreferrer">
                $CLAWD on Solscan ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
