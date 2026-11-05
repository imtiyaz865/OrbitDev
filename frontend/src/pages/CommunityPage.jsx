import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { communityLinks, validExternalUrl } from '../data/communityLinks.js'
import { useSeo } from '../seo/useSeo.js'

const channelDescriptions = {
  WhatsApp: 'Weekly event picks and community updates, sent where you already read your messages.',
  LinkedIn: 'News, announcements and highlights from Hyderabad’s tech ecosystem.',
  Instagram: 'Photos and moments from the events, the speakers and the people.',
}

const steps = [
  {
    index: '01',
    title: 'Find an event',
    body: 'Open the weekend guide to see the tech events happening across Hyderabad, with times in IST, venues and organisers listed.',
    action: { to: '/events', label: 'Browse events' },
  },
  {
    index: '02',
    title: 'Register with the organiser',
    body: 'Each listing links directly to the organiser’s registration page. No extra sign-up and no middle step.',
  },
  {
    index: '03',
    title: 'Stay in the loop',
    body: 'Follow The Orbit on the channels below so next weekend’s events and community updates reach you first.',
    action: { href: '#channels', label: 'See the channels' },
  },
]

function Channel({ channel }) {
  const href = validExternalUrl(channel.url)
  const description = channelDescriptions[channel.name]
  const body = (
    <>
      <span className="o-channel-icon" aria-hidden="true"><channel.Icon size={17} strokeWidth={1.5} /></span>
      <span className="o-channel-name">{channel.name}</span>
      <span className="o-channel-desc">{description}</span>
      <span className="o-channel-action">
        {href ? <>Follow <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden="true" /></> : 'Coming soon'}
      </span>
    </>
  )

  return (
    <li className={`o-channel${href ? '' : ' is-unavailable'}`}>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${channel.name}: ${description} (opens in a new tab)`}>{body}</a>
        : <div aria-label={`${channel.name}, coming soon`}>{body}</div>}
    </li>
  )
}

export function CommunityPage() {
  useSeo({
    title: 'Hyderabad tech community · The Orbit',
    description: 'Connect with Hyderabad’s tech community. Find developer meetups, startup events, design sessions and hackathons, and follow The Orbit for weekly updates.',
    path: '/community',
  })
  return (
    <>
      <section className="tone-dark o-page-hero" aria-labelledby="community-title">
        <div className="o-wrap">
          <p className="o-label">Community</p>
          <h1 id="community-title" className="o-h1">
            Connect with Hyderabad’s <em>tech community.</em>
          </h1>
          <p className="o-lead">
            Developer meetups, startup events, design sessions and hackathons happen across the city
            every week. The Orbit helps you find them, and stay in touch with the people you meet there.
          </p>
        </div>
      </section>

      <section className="tone-light o-section" aria-labelledby="steps-title">
        <div className="o-wrap o-split">
          <header className="o-split-aside">
            <p className="o-label">How it works</p>
            <h2 id="steps-title" className="o-h2">From finding an event to finding your people.</h2>
          </header>
          <ol className="o-rows">
            {steps.map((step) => (
              <li className="o-row" key={step.index}>
                <span className="o-row-index">{step.index}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {step.action?.to && <Link className="o-link o-link-small" to={step.action.to}>{step.action.label} <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" /></Link>}
                {step.action?.href && <a className="o-link o-link-small" href={step.action.href}>{step.action.label} <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" /></a>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tone-dark o-section" id="channels" aria-labelledby="channels-title">
        <div className="o-wrap">
          <header className="o-section-head">
            <div>
              <p className="o-label">Channels</p>
              <h2 id="channels-title" className="o-h2">Follow The Orbit</h2>
            </div>
            <p className="o-section-head-copy">Weekly event picks and community updates, on the platform you already use.</p>
          </header>
          <ul className="o-channels">
            {communityLinks.map((channel) => <Channel key={channel.name} channel={channel} />)}
          </ul>
        </div>
      </section>

      <section className="tone-light o-section o-band" aria-labelledby="ecosystem-title">
        <div className="o-wrap o-band-grid">
          <div>
            <p className="o-label">The ecosystem</p>
            <h2 id="ecosystem-title" className="o-h2 o-h2-lg">
              Communities host. People show up. <em>The ecosystem grows.</em>
            </h2>
          </div>
          <div className="o-band-body">
            <p>
              Every listing on The Orbit is someone’s effort: a community that booked the room, a speaker
              who prepared the talk, volunteers who made it happen. Showing up is how Hyderabad’s tech
              scene keeps growing.
            </p>
            <Link className="o-button o-button-dark" to="/events">
              See this weekend’s events <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
