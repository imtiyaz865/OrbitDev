import { ArrowUpRight, Instagram, Linkedin, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

const channels = [
  {
    name: "WhatsApp",
    url: import.meta.env.VITE_ORBIT_WHATSAPP_URL,
    Icon: MessageCircle,
  },
  {
    name: "LinkedIn",
    url: import.meta.env.VITE_ORBIT_LINKEDIN_URL,
    Icon: Linkedin,
  },
  {
    name: "Instagram",
    url: import.meta.env.VITE_ORBIT_INSTAGRAM_URL,
    Icon: Instagram,
  },
];

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <p>
            A community to make
            <br />
            things possible.
          </p>
          <div className="footer-socials" aria-label="Official social channels">
            {channels.map(({ name, url, Icon }) => {
              const href = safeExternalUrl(url);
              return href ? (
                <a
                  href={href}
                  key={name}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${name} (opens in a new tab)`}
                >
                  <Icon size={17} />
                </a>
              ) : null;
            })}
          </div>
        </div>
        <div className="footer-note">
          <span>Made for curious people.</span>
          <span>Hyderabad, India</span>
        </div>
        <Link to="/" className="footer-oversized-wordmark">
          THE ORBIT
        </Link>
      </div>
    </footer>
  );
}
