import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format, isSameDay } from "date-fns";
import { SiteHeader } from "../components/SiteHeader.jsx";
import { SiteFooter } from "../components/SiteFooter.jsx";
import { WeekendEvents } from "../components/WeekendEvents.jsx";
import { OrbitFieldSection } from "../components/OrbitFieldSection.jsx";
import { HeroSkyTransition } from "../components/HeroSkyTransition.jsx";
import { api } from "../services/api.js";
import {
  formatWeekendRange,
  getNextWeekend,
  localDateString,
  shiftWeekend,
} from "../utils/weekends.js";

export function HomePage() {
  const [weekend, setWeekend] = useState(() => getNextWeekend());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const currentWeekend = getNextWeekend();
  const isCurrent = isSameDay(weekend.start, currentWeekend.start);
  const weekendYears =
    format(weekend.start, "yyyy") === format(weekend.end, "yyyy")
      ? format(weekend.start, "yyyy")
      : `${format(weekend.start, "yyyy")}–${format(weekend.end, "yyyy")}`;
  const label = `${formatWeekendRange(weekend)}, ${weekendYears}`.toUpperCase();

  const loadEvents = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const result = await api.getWeekendEvents(
          localDateString(weekend.start),
          localDateString(weekend.end),
          signal,
        );
        setEvents(Array.isArray(result) ? result : result.events || []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Events could not be loaded.");
          setEvents([]);
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [weekend],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadEvents(controller.signal);
    return () => controller.abort();
  }, [loadEvents, retryKey]);

  return (
    <main className="home-page">
      <section className="home-hero">
        <HeroSkyTransition />
        <div className="page-shell">
          <SiteHeader />
          <section className="hero" aria-labelledby="home-title">
            <div className="hero-editorial">
              <div className="hero-kicker">
                <span className="live-dot" />
                Hyderabad · Weekend field guide
              </div>
              <h1 className="hero-title" id="home-title">
                Your next good plan
                <br />
                is <em>in orbit.</em>
              </h1>
              <div className="hero-foot">
                <p className="hero-copy">
                  Meet the people, ideas and experiences shaping our city —
                  all in one place.
                </p>
                <a className="hero-scroll" href="#weekend-list">
                  Find this weekend <ArrowRight size={18} />
                </a>
              </div>
            </div>
            <div className="hero-orbit-art" aria-hidden="true">
              <span className="hero-orbit-coordinate"><MapPin size={12} /> 17.3850° N · 78.4867° E</span>
              <span className="hero-orbit-ring hero-orbit-ring-outer" />
              <span className="hero-orbit-ring hero-orbit-ring-inner" />
              <span className="hero-orbit-planet" />
              <span className="hero-orbit-satellite" />
              <span className="hero-orbit-caption">A city full of possibility</span>
            </div>
          </section>
        </div>
      </section>

      <section
        className="weekend-section"
        id="weekend-list"
        aria-labelledby="discover-title"
      >
        <div className="page-shell">
          <div className="weekend-heading">
            <div className="weekend-heading-copy">
              <p className="section-eyebrow">EVENTS THIS WEEKEND</p>
              <h2 id="discover-title">
                What&apos;s happening
                <br />
                in the <em>city?</em>
              </h2>
              <p className="discover-description">
                Pick a date. Find a room full of curious people.
              </p>
            </div>
            <div className="weekend-controls">
              <span className="weekend-range-label">
                <CalendarDays size={17} aria-hidden="true" />
                <span>
                  {isCurrent ? "This weekend" : "Weekend of"}
                  <strong>{label}</strong>
                </span>
              </span>
              <button
                className="weekend-control"
                onClick={() =>
                  setWeekend((current) => shiftWeekend(current, -1))
                }
                disabled={isCurrent}
                aria-label="Previous weekend"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                className="weekend-control"
                onClick={() =>
                  setWeekend((current) => shiftWeekend(current, 1))
                }
                aria-label="Next weekend"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {error ? (
            <div className="state-message state-error" role="alert">
              <p>Events are out of reach for a moment.</p>
              <span>{error}</span>
              <button onClick={() => setRetryKey((key) => key + 1)}>
                Try again <ArrowUpRight size={14} />
              </button>
            </div>
          ) : loading ? (
            <div className="state-loading" aria-live="polite">
              <span className="loading-line" />
              Checking the calendar
            </div>
          ) : events.length > 0 ? (
            <WeekendEvents events={events} weekend={weekend} />
          ) : (
            <div className="empty-state">
              <span className="empty-index">A pause in the calendar</span>
              <h3>
                No events on the
                <br />
                <em>horizon yet.</em>
              </h3>
              <p>Try another weekend to see what&apos;s coming up.</p>
              <button
                className="text-link"
                onClick={() =>
                  setWeekend((current) => shiftWeekend(current, 1))
                }
              >
                Look ahead <ArrowUpRight size={15} />
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="page-shell">
        <OrbitFieldSection />
        <section
          className="community-invitation"
          aria-labelledby="community-title"
        >
          <div className="community-invitation-copy">
            <span className="community-eyebrow">
              GOOD THINGS HAPPEN TOGETHER
            </span>
            <h2 id="community-title">
              Find your
              <br />
              <em>people.</em>
            </h2>
            <p>
              Keep up with the groups bringing Hyderabad&apos;s tech community
              together.
            </p>
          </div>
          <Link className="community-cta" to="/community">
            Meet the community <ArrowUpRight size={18} />
          </Link>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
