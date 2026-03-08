import { render } from 'melina/client';

export default function mount() {
    const root = document.getElementById('rewards-root');
    if (!root) return;

    let wallet = '';
    let luck = 0;

    // Attempt to read wallet from solana phantom connection.
    try {
        const solana = (window as any).solana;
        if (solana && solana.isPhantom && solana.publicKey) {
            wallet = solana.publicKey.toString();
        } else {
            // Check localstorage if stored, warmaps keeps setting in connectedWallet state but not reliably exposed to other tabs
            wallet = 'Awaiting connection via Phantom...';
            if (solana?.isPhantom) {
                solana.connect({ onlyIfTrusted: true }).then((resp: any) => {
                    wallet = resp.publicKey.toString();
                    update();
                }).catch(() => { });
            }
        }
    } catch {
        // Ignored
    }

    const interval = setInterval(() => {
        if (luck < 100) {
            luck += Math.random() * 5;
            if (luck > 100) luck = 100;
            update();
        } else {
            clearInterval(interval);
        }
    }, 1000);

    const claim = () => {
        if (!wallet || wallet.includes('Awaiting')) {
            alert("Connect a compatible Solana wallet first!");
            return;
        }
        alert("Rewards claimed successfully! Payout processing to " + wallet.slice(0, 6) + "...");
        luck = 0;
        update();

        // Re-start after claim
        const intervalNext = setInterval(() => {
            if (luck < 100) {
                luck += Math.random() * 5;
                if (luck > 100) luck = 100;
                update();
            } else {
                clearInterval(intervalNext);
            }
        }, 1000);
    };

    const update = () => {
        render(
            <div style={{ padding: '60px 20px', maxWidth: '600px', width: '100%', fontFamily: 'system-ui, sans-serif' }}>
                <a href="/" style={{ color: '#64748b', textDecoration: 'none', fontFamily: 'monospace', marginBottom: '40px', display: 'inline-block' }}>← Back to WAR Room</a>

                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎰</div>
                    <h1 style={{ color: '#e2e8f0', margin: '0 0 8px 0', fontSize: '28px' }}>Lottery Rewards</h1>
                    <p style={{ color: '#94a3b8', margin: '0', fontSize: '14px', lineHeight: '1.5' }}>Keep your Intelligence Dashboard active to earn Luck. Once your Luck reaches 100%, you can claim your SOL reward.</p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '32px', marginBottom: '32px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748b', marginBottom: '12px', letterSpacing: '1px' }}>CONNECTED WALLET</div>
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '14px', color: '#cbd5e1', wordBreak: 'break-all', fontFamily: 'monospace', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {wallet || 'Waiting for Phantom connection...'}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontWeight: 'bold', color: '#22c55e', fontSize: '14px', letterSpacing: '1px' }}>LUCK ACCUMULATION</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '18px', color: '#22c55e', fontWeight: 'bold' }}>{luck.toFixed(1)}%</span>
                    </div>

                    <div style={{ height: '24px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '12px', overflow: 'hidden', marginBottom: '32px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                        <div style={{ height: '100%', width: `${luck}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.5s ease-out' }}></div>
                    </div>

                    <button
                        onClick={claim}
                        disabled={luck < 100}
                        style={{
                            width: '100%',
                            padding: '16px',
                            background: luck >= 100 ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255, 255, 255, 0.05)',
                            color: luck >= 100 ? '#fff' : '#64748b',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: luck >= 100 ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s',
                            boxShadow: luck >= 100 ? '0 4px 20px rgba(34, 197, 94, 0.4)' : 'none',
                            letterSpacing: '1px'
                        }}
                    >
                        {luck >= 100 ? 'CLAIM REWARD' : 'GATHERING LUCK...'}
                    </button>
                </div>
            </div>,
            root
        );
    };

    update();

    return () => {
        clearInterval(interval);
        render(null, root);
    };
}
