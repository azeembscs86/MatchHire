import { useState } from 'react';

const DEFAULT_SKILLS = ['React', 'TypeScript', 'Next.js', 'Node.js', 'GraphQL', 'Tailwind', 'PostgreSQL', 'Figma'];

export default function Profile() {
  const [skills, setSkills] = useState(DEFAULT_SKILLS);
  const [skillInput, setSkillInput] = useState('');

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault();
      if (!skills.includes(skillInput.trim())) setSkills([...skills, skillInput.trim()]);
      setSkillInput('');
    }
  };

  const removeSkill = (s) => setSkills(skills.filter((x) => x !== s));

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Profile saved (demo).');
  };

  return (
    <section className="view active" id="view-profile">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ My profile</span>
          <h1 className="display">Build your <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>professional</span> story.</h1>
          <p>The more complete your profile, the better matches you'll get. Aim for 100%.</p>
        </div>
      </div>

      <div className="container profile-layout">
        <aside className="profile-side">
          <div className="profile-avatar">
            AK
            <div className="upload">+</div>
          </div>
          <div className="profile-name">Ayesha Khan</div>
          <div className="profile-headline">Senior Frontend Engineer</div>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center' }}>Preview public profile</button>
          <div className="completion">
            <small><span>Profile completion</span><span style={{ color: 'var(--coral)', fontWeight: 600 }}>65%</span></small>
            <div className="completion-bar"><div className="completion-fill"></div></div>
            <small style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 8 }}>Add a portfolio link to reach 80%</small>
          </div>
        </aside>

        <form className="profile-main" onSubmit={handleSubmit}>
          <div className="form-card">
            <div className="form-card-head">
              <h3>Personal information</h3>
              <span className="step">01 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Full name</label><input defaultValue="Ayesha Khan" /></div>
              <div className="form-field"><label>Professional headline</label><input defaultValue="Senior Frontend Engineer" /></div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Email address</label><input defaultValue="ayesha@matchhire.com" /></div>
              <div className="form-field"><label>Phone</label><input defaultValue="+92 300 1234567" /></div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Location</label><input defaultValue="Karachi, Pakistan" /></div>
              <div className="form-field"><label>Open to relocate</label>
                <select>
                  <option>Yes — anywhere</option>
                  <option>Yes — within region</option>
                  <option>Remote only</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-head">
              <h3>About you</h3>
              <span className="step">02 / 05</span>
            </div>
            <div className="form-row single">
              <div className="form-field">
                <label>Bio · 2-4 sentences about your work</label>
                <textarea defaultValue="Frontend engineer with 7 years building production interfaces for fintech and SaaS. I care about performance, accessibility, and design systems that scale. Currently shipping at a Series B, looking for my next senior IC role." />
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-head">
              <h3>Skills & expertise</h3>
              <span className="step">03 / 05</span>
            </div>
            <div className="form-row single">
              <div className="form-field">
                <label>Add your skills · these power your matches</label>
                <div className="skills-input">
                  {skills.map((s) => (
                    <span key={s} className="skill-pill">
                      {s}
                      <button type="button" onClick={() => removeSkill(s)}>×</button>
                    </span>
                  ))}
                  <input
                    placeholder="Type a skill and press enter…"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={addSkill}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-head">
              <h3>Work experience</h3>
              <span className="step">04 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Company</label><input defaultValue="Verkada" /></div>
              <div className="form-field"><label>Title</label><input defaultValue="Senior Frontend Engineer" /></div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Start date</label><input defaultValue="March 2022" /></div>
              <div className="form-field"><label>End date</label><input defaultValue="Present" /></div>
            </div>
            <div className="form-row single">
              <div className="form-field"><label>What you did</label>
                <textarea defaultValue="Led the migration of our legacy dashboard to Next.js 14, reducing TTI by 64%. Built and shipped the design system used across 12 product surfaces. Mentored 3 junior engineers." />
              </div>
            </div>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }}>+ Add another role</button>
          </div>

          <div className="form-card">
            <div className="form-card-head">
              <h3>What you're looking for</h3>
              <span className="step">05 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Desired role</label><input defaultValue="Staff Frontend / Tech Lead" /></div>
              <div className="form-field"><label>Salary expectation (USD)</label><input defaultValue="$150K – $200K" /></div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Work preference</label>
                <select>
                  <option>Remote</option>
                  <option>Hybrid</option>
                  <option>Onsite</option>
                </select>
              </div>
              <div className="form-field"><label>Availability</label>
                <select>
                  <option>Within 30 days</option>
                  <option>2 months notice</option>
                  <option>Just exploring</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line-soft)' }}>
              <button type="button" className="btn btn-ghost">Save draft</button>
              <button type="submit" className="btn btn-coral">Save & publish profile →</button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
