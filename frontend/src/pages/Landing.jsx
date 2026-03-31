import { Link } from 'react-router-dom'

/**
 * Public welcome / marketing home — premium visuals + CSS motion.
 */
function Landing() {
  return (
    <div className="landing">
      <div className="landing__bg" aria-hidden>
        <div className="landing__bg-noise" />
        <div className="landing__bg-mesh" />
        <div className="landing__orb landing__orb--1" />
        <div className="landing__orb landing__orb--2" />
        <div className="landing__orb landing__orb--3" />
        <div className="landing__orb landing__orb--4" />
        <div className="landing__grid" />
        <div className="landing__ring landing__ring--1" />
        <div className="landing__ring landing__ring--2" />
      </div>

      <div className="landing__inner">
        <header className="landing__nav landing__nav--glass landing__reveal landing__reveal--1">
          <Link to="/" className="landing__logo-wrap">
            <span className="landing__logo-mark" aria-hidden>
              <img className="landing__logo-img" src="/vite.svg" alt="" aria-hidden />
            </span>
            <span className="landing__logo">Chatapp</span>
          </Link>
          <div className="landing__nav-actions">
            <Link className="landing__link" to="/login">
              Sign in
            </Link>
            <Link className="landing__btn landing__btn--primary landing__btn--glow" to="/register">
              Get started
            </Link>
          </div>
        </header>

        <section className="landing__hero landing__hero-split">
          <div className="landing__hero-copy">
            <p className="landing__eyebrow landing__reveal landing__reveal--2">
              <span className="landing__eyebrow-dot" aria-hidden />
              Welcome — your team&apos;s calm HQ
            </p>
            <h1 className="landing__title landing__reveal landing__reveal--3">
              <span className="landing__title-gradient landing__title-gradient--animated">
                Conversation, made calm &amp; clear
              </span>
            </h1>
            <p className="landing__lead landing__reveal landing__reveal--4">
              A place for your team to talk in real time—without the noise. We believe
              the best work happens when messages feel human, channels stay organized,
              and everyone knows they belong in the room.
            </p>
            <div className="landing__hero-cta landing__reveal landing__reveal--5">
              <Link className="landing__btn landing__btn--primary landing__btn--glow" to="/register">
                Create your space
              </Link>
              <Link className="landing__btn landing__btn--ghost" to="/login">
                I already have an account
              </Link>
            </div>
            <ul className="landing__pills landing__reveal landing__reveal--6a" aria-label="Highlights">
              <li className="landing__pill">Live presence</li>
              <li className="landing__pill">Spaces &amp; DMs</li>
              <li className="landing__pill">File sharing</li>
              <li className="landing__pill">Built for focus</li>
            </ul>
          </div>

          <div
            className="landing__hero-visual landing__reveal landing__reveal--4"
            aria-hidden
          >
            <div className="landing__mock">
              <div className="landing__mock-glow" />
              <div className="landing__mock-header">
                <span className="landing__mock-dots">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="landing__mock-title">design-team · general</span>
                <span className="landing__mock-live">Live</span>
              </div>
              <div className="landing__mock-thread">
                <div className="landing__mock-msg landing__mock-msg--a">
                  <span className="landing__mock-avatar">AK</span>
                  <div className="landing__mock-bubble landing__mock-bubble--other">
                    Ship the preview today? We can iterate after feedback ✨
                  </div>
                </div>
                <div className="landing__mock-msg landing__mock-msg--b">
                  <div className="landing__mock-bubble landing__mock-bubble--self">
                    On it — sharing the build in ~10m
                  </div>
                  <span className="landing__mock-avatar landing__mock-avatar--self">You</span>
                </div>
                <div className="landing__mock-msg landing__mock-msg--c">
                  <span className="landing__mock-avatar">MJ</span>
                  <div className="landing__mock-bubble landing__mock-bubble--other landing__mock-bubble--typing">
                    <span className="landing__mock-typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                </div>
              </div>
              <div className="landing__mock-compose">
                <span className="landing__mock-placeholder">Message design-team…</span>
                <span className="landing__mock-send">Send</span>
              </div>
            </div>
          </div>
        </section>

        <ul className="landing__stats landing__reveal landing__reveal--7">
          <li className="landing__stat">
            <span className="landing__stat-value">Real-time</span>
            <span className="landing__stat-label">typing &amp; presence</span>
          </li>
          <li className="landing__stat">
            <span className="landing__stat-value">Organized</span>
            <span className="landing__stat-label">spaces &amp; threads</span>
          </li>
          <li className="landing__stat">
            <span className="landing__stat-value">Thoughtful</span>
            <span className="landing__stat-label">by design</span>
          </li>
        </ul>

        <figure className="landing__quote landing__quote--card landing__reveal landing__reveal--7">
          <blockquote>
            “We didn’t build this to chase notifications—we built it to protect
            attention, trust, and the small moments that turn a group into a team.”
          </blockquote>
          <figcaption>— Why we’re here</figcaption>
        </figure>

        <section className="landing__section" aria-labelledby="landing-philosophy">
          <div className="landing__section-head landing__reveal landing__reveal--9">
            <h2 id="landing-philosophy" className="landing__section-title">
              <span className="landing__section-title-accent">What we care about</span>
            </h2>
            <p className="landing__section-sub">
              Three ideas guide everything we ship—so the product stays as intentional
              as the conversations inside it.
            </p>
          </div>
          <div className="landing__cards">
            <article className="landing__card landing__card--a landing__card--accent-violet">
              <div className="landing__card-icon" aria-hidden>
                ✦
              </div>
              <h3>Presence over performance</h3>
              <p>
                Chat shouldn’t feel like a scoreboard. We focus on clarity—who’s
                here, what matters now, and what can wait—so people can think deeply
                and respond honestly.
              </p>
            </article>
            <article className="landing__card landing__card--b landing__card--accent-rose">
              <div className="landing__card-icon" aria-hidden>
                ◇
              </div>
              <h3>Rooms with context</h3>
              <p>
                Spaces and direct messages keep history where it belongs. Less
                thread-hunting, fewer “which channel was that?” moments—more flow
                for the work you actually do.
              </p>
            </article>
            <article className="landing__card landing__card--c landing__card--accent-sky">
              <div className="landing__card-icon" aria-hidden>
                ✧
              </div>
              <h3>Built for real collaboration</h3>
              <p>
                From typing indicators to shared files, every piece exists to make
                collaboration feel natural—not like fighting the tool. Security and
                care for what you share sit at the center, not the fine print.
              </p>
            </article>
          </div>
        </section>

        <footer className="landing__footer landing__reveal landing__reveal--10">
          <div className="landing__footer-inner">
            <p>Ready when you are—sign in or create an account to open your workspace.</p>
            <div className="landing__footer-cta">
              <Link className="landing__btn landing__btn--primary landing__btn--sm" to="/register">
                Get started free
              </Link>
              <Link className="landing__link landing__footer-link" to="/login">
                Sign in →
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default Landing
