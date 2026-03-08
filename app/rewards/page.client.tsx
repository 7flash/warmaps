import { render } from 'melina/client';

export default function mount() {
    const root = document.getElementById('rewards-root');
    if (!root) return;

    let wallet = '';
    let isSpinning = false;
    let rotation = 0;
    let winner = '';

    // Mock holders with weights (corresponds to % they hold)
    let holders = [
        { label: '88TyuEqo...', weight: 15, color: '#3b82f6' },
        { label: '3xF9b...', weight: 25, color: '#f59e0b' },
        { label: '7mK2p...', weight: 10, color: '#ec4899' },
        { label: 'Raydium Pool', weight: 40, color: '#64748b' },
        { label: 'Awaiting You...', weight: 10, color: '#22c55e' }
    ];

    try {
        const solana = (window as any).solana;
        if (solana && solana.isPhantom && solana.publicKey) {
            wallet = solana.publicKey.toString();
            holders[4].label = `You (${wallet.slice(0, 4)}...)`;
        } else {
            if (solana?.isPhantom) {
                solana.connect({ onlyIfTrusted: true }).then((resp: any) => {
                    wallet = resp.publicKey.toString();
                    holders[4].label = `You (${wallet.slice(0, 4)}...)`;
                    update();
                }).catch(() => { });
            }
        }
    } catch { }

    const spinWheel = () => {
        if (!wallet) {
            alert("Connect a compatible Solana wallet first!");
            return;
        }
        if (isSpinning) return;

        isSpinning = true;
        winner = '';
        update();

        // Random rotation between 3 and 6 full spins + random offset
        const spins = 3 + Math.floor(Math.random() * 4);
        const randomDegree = Math.floor(Math.random() * 360);
        rotation += (spins * 360) + randomDegree;

        update();

        setTimeout(() => {
            isSpinning = false;
            // Calculate winner based on final angle (mod 360)
            const finalAngle = (360 - (rotation % 360)) % 360; // top is 0!

            let currentAngle = 0;
            for (const h of holders) {
                const sliceAngle = (h.weight / 100) * 360;
                if (finalAngle >= currentAngle && finalAngle < currentAngle + sliceAngle) {
                    winner = h.label;
                    break;
                }
                currentAngle += sliceAngle;
            }
            update();
        }, 4000); // matches CSS transition duration
    };

    const Circle = () => {
        let currentOffset = 0;
        return (
            <div style={{ position: 'relative', width: '240px', height: '240px', margin: '0 auto 32px auto' }}>
                <svg viewBox="0 0 100 100" style={{
                    width: '100%', height: '100%',
                    transform: `rotate(${rotation}deg)`,
                    transition: isSpinning ? 'transform 4s cubic-bezier(0.1, 0.8, 0.1, 1)' : 'none',
                    borderRadius: '50%',
                    boxShadow: '0 0 20px rgba(0,0,0,0.5)',
                    transformOrigin: '50% 50%'
                }}>
                    <circle cx="50" cy="50" r="50" fill="#0f172a" />
                    {holders.map((h, i) => {
                        const dashLen = (h.weight / 100) * 157.08;
                        const strokeDasharray = `${dashLen} 157.08`;
                        const strokeDashoffset = -currentOffset;
                        currentOffset += dashLen;
                        return <circle key={i} cx="50" cy="50" r="25" fill="transparent" stroke={h.color} strokeWidth="50" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }} />
                    })}
                </svg>
                {/* Pointer */}
                <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', width: '0', height: '0', borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '20px solid #e2e8f0', zIndex: 10 }}></div>

                {/* Center cap */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '20%', height: '20%', background: '#0f172a', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', zIndex: 5 }}></div>
            </div>
        );
    };

    const update = () => {
        render(
            <div style={{ padding: '60px 20px', maxWidth: '600px', width: '100%', fontFamily: 'system-ui, sans-serif' }}>
                <a href="/" style={{ color: '#64748b', textDecoration: 'none', fontFamily: 'monospace', marginBottom: '40px', display: 'inline-block' }}>← Back to WAR Room</a>

                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎰</div>
                    <h1 style={{ color: '#e2e8f0', margin: '0 0 8px 0', fontSize: '28px' }}>Holder Lottery</h1>
                    <p style={{ color: '#94a3b8', margin: '0', fontSize: '14px', lineHeight: '1.5' }}>Your section of the wheel corresponds to your token holdings. Spin to win the distributed SOL reward pool.</p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '32px', marginBottom: '32px' }}>

                    <Circle />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                        {holders.map((h, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: h.color }}></div>
                                {h.label} ({h.weight}%)
                            </div>
                        ))}
                    </div>

                    {winner && !isSpinning && (
                        <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e', textAlign: 'center', marginBottom: '24px', fontWeight: 'bold' }}>
                            🎉 Winner: {winner} 🎉
                        </div>
                    )}

                    <button
                        onClick={spinWheel}
                        disabled={isSpinning}
                        style={{
                            width: '100%',
                            padding: '16px',
                            background: isSpinning ? 'rgba(255, 255, 255, 0.05)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                            color: isSpinning ? '#64748b' : '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: isSpinning ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: isSpinning ? 'none' : '0 4px 20px rgba(37, 99, 235, 0.4)',
                            letterSpacing: '1px'
                        }}
                    >
                        {isSpinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
                    </button>
                </div>
            </div>,
            root
        );
    };

    update();

    return () => {
        render(null, root);
    };
}
