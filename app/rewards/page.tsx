import { Head } from 'melina/server';

export default function RewardsPage() {
    return (
        <>
            <Head>
                <title>Lottery Rewards — WARMAPS</title>
                <style>{`
                    body {
                        background: #050913;
                        color: #e2e8f0;
                        font-family: system-ui, -apple-system, sans-serif;
                        margin: 0;
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }
                    * {
                        box-sizing: border-box;
                    }
                `}</style>
            </Head>
            <div id="rewards-root" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}></div>
        </>
    );
}
