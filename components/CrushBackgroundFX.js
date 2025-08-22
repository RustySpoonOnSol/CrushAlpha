export default function CrushBackgroundFX() {
  return (
    <>
      {/* Main Sparkles/Hearts/Emojis */}
      <div className="crush-bg-fx">
        {/* Example: Add as many as you want, staggered and animated for flavor */}
        <span className="bgfx sparkle" style={{ left: '12vw', top: '8vh' }}>✨</span>
        <span className="bgfx lips" style={{ left: '19vw', top: '36vh' }}>💋</span>
        <span className="bgfx heart" style={{ left: '7vw', top: '62vh' }}>❤️</span>
        <span className="bgfx kiss" style={{ left: '44vw', top: '22vh' }}>😘</span>
        <span className="bgfx water" style={{ left: '86vw', top: '13vh' }}>💦</span>
        <span className="bgfx heart2" style={{ left: '79vw', top: '41vh' }}>💘</span>
        <span className="bgfx lips2" style={{ left: '88vw', top: '77vh' }}>💋</span>
        <span className="bgfx sparkle2" style={{ left: '59vw', top: '70vh' }}>✨</span>
        {/* Add more for density/flavor */}
      </div>
      <style jsx>{`
        .crush-bg-fx {
          position: fixed;
          pointer-events: none;
          left: 0; top: 0; width: 100vw; height: 100vh;
          z-index: 1;
          overflow: hidden;
        }
        .bgfx {
          position: absolute;
          font-size: 2.5rem;
          opacity: 0.34;
          animation: float-fx 9s ease-in-out infinite alternate;
        }
        .sparkle, .sparkle2 {
          font-size: 1.4rem;
          opacity: 0.22;
          animation-duration: 10s;
        }
        .heart2, .water {
          font-size: 2rem;
          animation-duration: 8.5s;
        }
        @keyframes float-fx {
          0% { transform: translateY(0) scale(1);}
          50% { transform: translateY(-18px) scale(1.05);}
          100% { transform: translateY(0) scale(1);}
        }
      `}</style>
    </>
  );
}