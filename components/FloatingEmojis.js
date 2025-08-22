import { useEffect, useState } from "react";

const EMOJIS = ["💖", "💋", "❤️", "😘", "🔥"];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function getRandomEmoji() {
  return EMOJIS[getRandomInt(0, EMOJIS.length)];
}

function getRandomPosition() {
  // Only near the chat area - play with these values if needed!
  return {
    top: `calc(50% + ${getRandomInt(-140, 140)}px)`,
    left: `calc(50% + ${getRandomInt(-220, 220)}px)`
  };
}

export default function FloatingEmojis() {
  const [emojis, setEmojis] = useState([]);

  useEffect(() => {
    let interval, timeout;
    function launch() {
      const count = getRandomInt(4, 6);
      setEmojis(
        Array.from({ length: count }).map(() => ({
          id: Math.random().toString(36).slice(2),
          emoji: getRandomEmoji(),
          ...getRandomPosition()
        }))
      );
      setTimeout(() => setEmojis([]), 3500);
    }
    // Start after 8-12s, then repeat every 10–15s
    timeout = setTimeout(() => {
      launch();
      interval = setInterval(launch, getRandomInt(10000, 15000));
    }, getRandomInt(8000, 12000));
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <>
      {emojis.map(e => (
        <span
          key={e.id}
          className="floating-emoji"
          style={{
            top: e.top,
            left: e.left,
            position: "absolute",
            zIndex: 50,
            pointerEvents: "none",
            fontSize: "2.6rem",
            animation: "floatEmoji 3.5s cubic-bezier(0.4,1.1,0.8,1) forwards"
          }}
        >
          {e.emoji}
        </span>
      ))}
    </>
  );
}
