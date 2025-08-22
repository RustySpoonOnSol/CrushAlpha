export default function SupportPage() {
  return (
    <div className="page-container">
      <h1 className="page-title">🔥 Support The Project</h1>
      <p className="page-text">Keep the passion alive by supporting Crush AI. Your love fuels our flirty fire. 💘</p>

      <style jsx>{`
        .page-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #ffc1d3, #b5a3f5);
          color: white;
          text-align: center;
          padding: 2rem;
        }

        .page-title {
          font-size: 3rem;
          font-weight: bold;
          text-shadow: 0 0 10px #fa1a81;
          margin-bottom: 1.5rem;
        }

        .page-text {
          font-size: 1.2rem;
          max-width: 600px;
          line-height: 1.6;
          text-shadow: 0 0 4px #fa1a81aa;
        }
      `}</style>
    </div>
  );
}
