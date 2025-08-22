// components/ShareOnX.js
export default function ShareOnX({
  text = "Chatting with Xenia on Crush AI 💘",
  url = "https://yourdomain.com",
  hashtags = ["Solana","AI","Crypto"],
  via = "CrushAIx",
  className = "",
  style = {}
}) {
  const intent = (() => {
    const base = "https://x.com/intent/tweet";
    const params = new URLSearchParams({
      text,
      url,
      via,
      hashtags: hashtags.join(","),
    }).toString();
    return `${base}?${params}`;
  })();

  return (
    <a
      href={intent}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Share on X"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 9999,
        background: "linear-gradient(135deg, #ff6aa9, #e098f8)",
        color: "#fff",
        fontWeight: 800,
        textDecoration: "none",
        boxShadow: "0 10px 22px #fa1a8140",
        ...style
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M20 7.2c-.6.3-1.2.5-1.9.6.7-.4 1.1-1 1.4-1.8-.6.4-1.3.7-2.1.9a3.1 3.1 0 0 0-5.3 2.1c0 .3 0 .6.1.8-2.6-.1-4.9-1.4-6.4-3.3-.3.6-.5 1.1-.5 1.8 0 1.1.6 2.1 1.5 2.7-.6 0-1.1-.2-1.6-.4 0 1.5 1.1 2.8 2.6 3.1-.3.1-.6.1-.9.1-.2 0-.4 0-.6-.1.4 1.3 1.7 2.3 3.2 2.3A6.3 6.3 0 0 1 4 18.7 8.9 8.9 0 0 0 8.9 20c5.3 0 8.2-4.4 8.2-8.2v-.4c.6-.4 1.2-1 1.6-1.7z"/>
      </svg>
      Share on X
    </a>
  );
}
