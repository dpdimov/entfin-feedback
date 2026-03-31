import { useState, useRef, useEffect } from "react";

const RUBRIC_CONTEXT = `You are a formative feedback assistant for a university assignment where students evaluate a startup funding pitch. Students must conduct independent due diligence and construct evidence-based arguments across four pillars: Opportunity, Scalability, Execution, and Return. Each pillar is worth 25%.

KEY ASSESSMENT PRINCIPLES:
- Both "invest" and "don't invest" can achieve top marks. Quality of research, depth of analysis, and sophistication of reasoning matter—not the conclusion.
- The central skill being assessed is CRITICAL EVALUATION. Simply repeating pitch claims is the most common failing.
- Students should treat pitch claims as hypotheses to be tested, not facts to be reported.
- Good argument structure: Evidence (ground) → Claim → Warrant (why evidence supports claim)
- Credit what is present, not penalise what is absent.

QUALITY LEVELS (for calibration):
- Outstanding (85-100%): 10+ sources incl. primary research, original insights, sophisticated frameworks, could inform actual decisions
- Excellent (70-84%): 6+ sources, critical questioning, multiple analytical approaches, professional-grade
- Good (60-69%): 3-5 sources, systematic framework use, clear reasoning, evidence-based judgments
- Satisfactory (50-59%): 1-2 sources, mechanical application, surface-level, meets minimum
- Unsatisfactory (0-49%): No independent research, pitch at face value, absent analysis

PILLAR-SPECIFIC GUIDANCE:

OPPORTUNITY: Should challenge pitch claims about problem severity, validate market need independently, evaluate competitive advantage sustainability, critically evaluate customer validation quality (not just presence). Red flags: listing features, accepting market size from pitch, "first mover" without evaluation.

SCALABILITY: Should validate TAM/SAM/SOM independently, analyse unit economics (CAC/LTV, margins), identify growth constraints, assess competitive intensity. Red flags: accepting pitch market sizing, no unit economics, generic growth statements.

EXECUTION: Should research team independently (LinkedIn, Companies House), evaluate GTM feasibility, test milestone logic against capital, stress-test financial model. Red flags: accepting team credentials from pitch, listing milestones without assessment, uninterrogated financial model. Credit methodological competence even when inputs are flawed.

RETURN: Should challenge valuation with comparables, model cap table with dilution, evaluate deal terms from investor perspective, model multiple exit scenarios. Red flags: restating deal terms, accepting valuation, generic exit lists, confusing revenue multiples.

RED FLAGS TO WATCH FOR:
- "Selling" the company rather than critiquing the pitch
- Personal opinion without evidence ("I wouldn't buy this")
- Frameworks mentioned but not applied ("theory sprinkling")
- Accepting traction metrics (social followers, impressions) as product-market fit
- Vanity metrics treated as commercial traction

YOUR TASK: Provide formative feedback on a student's 300-word writing sample. This is a DRAFT — be encouraging but honest. Your goal is to help them improve before submission.

IMPORTANT: After your feedback, add a line containing ONLY a JSON block in the following format (the student will not see this):
[DIAGNOSTIC_TAGS]{"tags":["tag1","tag2","tag3"],"band":"Satisfactory|Good|Excellent|Outstanding|Unsatisfactory"}[/DIAGNOSTIC_TAGS]

The "tags" should be 2-5 short diagnostic labels (3-5 words each) capturing the key issues or strengths you identified. Examples: "restating pitch claims", "no independent sources", "strong evidence chains", "weak unit economics", "theory sprinkling", "good critical questioning", "no exit modelling", "accepts pitch valuation". Use consistent phrasing across submissions. The "band" should be the quality band you indicated in your feedback.`;

const WORD_LIMIT = 300;

const PILLARS = [
  { id: "opportunity", label: "Opportunity", color: "#2d6a4f" },
  { id: "scalability", label: "Scalability", color: "#1b4965" },
  { id: "execution", label: "Execution", color: "#7b2d8e" },
  { id: "return", label: "Return", color: "#9e4a1a" },
  { id: "conclusion", label: "Conclusion / Overall", color: "#555" },
];

const FOCUS_OPTIONS = [
  { id: "general", label: "General quality feedback" },
  { id: "critical", label: "Am I being critical enough?" },
  { id: "evidence", label: "Is my evidence use strong?" },
  { id: "argument", label: "Is my argument structure clear?" },
  { id: "research", label: "Are my sources adequate?" },
];

const ADMIN_PASSWORD = "entfin";

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// Timeout wrapper to prevent storage calls from hanging indefinitely
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Storage timeout")), ms)),
  ]);
}

function parseDiagnosticTags(rawText) {
  const tagMatch = rawText.match(/\[DIAGNOSTIC_TAGS\](.*?)\[\/DIAGNOSTIC_TAGS\]/s);
  let tags = [];
  let band = "";
  let cleanText = rawText;

  if (tagMatch) {
    cleanText = rawText.replace(/\[DIAGNOSTIC_TAGS\].*?\[\/DIAGNOSTIC_TAGS\]/s, "").trim();
    try {
      const parsed = JSON.parse(tagMatch[1]);
      tags = parsed.tags || [];
      band = parsed.band || "";
    } catch (e) {
      console.error("Failed to parse diagnostic tags:", e);
    }
  }
  return { cleanText, tags, band };
}

// --- Analytics helpers ---
async function logSubmission(pillar, focus, wordCount, tags, band) {
  try {
    let entries = [];
    try {
      const existing = await withTimeout(window.storage.get("analytics:submissions", true));
      if (existing && existing.value) {
        entries = JSON.parse(existing.value);
      }
    } catch (e) {
      // Key doesn't exist yet or timed out
    }
    entries.push({
      pillar,
      focus,
      wordCount,
      tags,
      band,
      timestamp: new Date().toISOString(),
    });
    await withTimeout(window.storage.set("analytics:submissions", JSON.stringify(entries), true));
  } catch (err) {
    console.error("Failed to log analytics:", err);
  }
}

async function loadAnalytics() {
  try {
    const existing = await withTimeout(window.storage.get("analytics:submissions", true));
    if (existing && existing.value) {
      return JSON.parse(existing.value);
    }
  } catch (e) {
    // No data yet or timed out
  }
  return [];
}

// --- Dashboard Component ---
function AnalyticsDashboard({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadAnalytics().then((entries) => {
      setData(entries);
      setLoading(false);
    }).catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={dashStyles.overlay}>
        <div style={dashStyles.modal}>
          <p style={{ textAlign: "center", color: "#888", padding: 32 }}>Loading analytics…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={dashStyles.overlay}>
        <div style={dashStyles.modal}>
          <div style={dashStyles.modalHeader}>
            <h2 style={dashStyles.modalTitle}>Usage Analytics</h2>
            <button onClick={onClose} style={dashStyles.closeBtn}>✕</button>
          </div>
          <p style={{ textAlign: "center", color: "#999", padding: 32 }}>
            Unable to load analytics data. The shared storage may be temporarily unavailable. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  const entries = data || [];
  const totalSubmissions = entries.length;

  // Pillar breakdown
  const pillarCounts = {};
  PILLARS.forEach((p) => (pillarCounts[p.id] = 0));
  entries.forEach((e) => {
    if (pillarCounts[e.pillar] !== undefined) pillarCounts[e.pillar]++;
  });

  // Focus breakdown
  const focusCounts = {};
  FOCUS_OPTIONS.forEach((f) => (focusCounts[f.id] = 0));
  entries.forEach((e) => {
    if (focusCounts[e.focus] !== undefined) focusCounts[e.focus]++;
  });

  // Band breakdown
  const bandCounts = {};
  entries.forEach((e) => {
    if (e.band) {
      bandCounts[e.band] = (bandCounts[e.band] || 0) + 1;
    }
  });

  // Tag frequency
  const tagCounts = {};
  entries.forEach((e) => {
    (e.tags || []).forEach((tag) => {
      const normalized = tag.toLowerCase().trim();
      tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
    });
  });
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // Tags by pillar
  const tagsByPillar = {};
  PILLARS.forEach((p) => (tagsByPillar[p.id] = {}));
  entries.forEach((e) => {
    if (tagsByPillar[e.pillar]) {
      (e.tags || []).forEach((tag) => {
        const normalized = tag.toLowerCase().trim();
        tagsByPillar[e.pillar][normalized] = (tagsByPillar[e.pillar][normalized] || 0) + 1;
      });
    }
  });

  // Average word count
  const avgWords =
    totalSubmissions > 0
      ? Math.round(entries.reduce((s, e) => s + (e.wordCount || 0), 0) / totalSubmissions)
      : 0;

  // Usage by day
  const byDay = {};
  entries.forEach((e) => {
    const day = e.timestamp ? e.timestamp.slice(0, 10) : "unknown";
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const sortedDays = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));

  const maxBar = Math.max(...Object.values(pillarCounts), 1);
  const maxTagBar = sortedTags.length > 0 ? sortedTags[0][1] : 1;
  const maxDayBar = sortedDays.length > 0 ? Math.max(...sortedDays.map((d) => d[1])) : 1;

  return (
    <div style={dashStyles.overlay}>
      <div style={dashStyles.modal}>
        <div style={dashStyles.modalHeader}>
          <h2 style={dashStyles.modalTitle}>Usage Analytics</h2>
          <button onClick={onClose} style={dashStyles.closeBtn}>✕</button>
        </div>

        <div style={dashStyles.scrollArea}>
          {totalSubmissions === 0 ? (
            <p style={{ color: "#888", textAlign: "center", padding: 32 }}>
              No submissions recorded yet. Data will appear here once students use the tool.
            </p>
          ) : (
            <>
              {/* Summary row */}
              <div style={dashStyles.statRow}>
                <div style={dashStyles.statCard}>
                  <div style={dashStyles.statNumber}>{totalSubmissions}</div>
                  <div style={dashStyles.statLabel}>Total Submissions</div>
                </div>
                <div style={dashStyles.statCard}>
                  <div style={dashStyles.statNumber}>{avgWords}</div>
                  <div style={dashStyles.statLabel}>Avg Word Count</div>
                </div>
                <div style={dashStyles.statCard}>
                  <div style={dashStyles.statNumber}>{sortedDays.length}</div>
                  <div style={dashStyles.statLabel}>Active Days</div>
                </div>
              </div>

              {/* Pillar breakdown */}
              <div style={dashStyles.section}>
                <h3 style={dashStyles.sectionTitle}>Submissions by Pillar</h3>
                {PILLARS.map((p) => (
                  <div key={p.id} style={dashStyles.barRow}>
                    <span style={{ ...dashStyles.barLabel, color: p.color }}>{p.label}</span>
                    <div style={dashStyles.barTrack}>
                      <div
                        style={{
                          ...dashStyles.barFill,
                          width: `${(pillarCounts[p.id] / maxBar) * 100}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                    <span style={dashStyles.barCount}>{pillarCounts[p.id]}</span>
                  </div>
                ))}
              </div>

              {/* Focus breakdown */}
              <div style={dashStyles.section}>
                <h3 style={dashStyles.sectionTitle}>Feedback Focus Requested</h3>
                {FOCUS_OPTIONS.map((f) => {
                  const maxFocus = Math.max(...Object.values(focusCounts), 1);
                  return (
                    <div key={f.id} style={dashStyles.barRow}>
                      <span style={dashStyles.barLabel}>{f.label}</span>
                      <div style={dashStyles.barTrack}>
                        <div
                          style={{
                            ...dashStyles.barFill,
                            width: `${(focusCounts[f.id] / maxFocus) * 100}%`,
                            backgroundColor: "#2d6a4f",
                          }}
                        />
                      </div>
                      <span style={dashStyles.barCount}>{focusCounts[f.id]}</span>
                    </div>
                  );
                })}
              </div>

              {/* Quality band distribution */}
              {Object.keys(bandCounts).length > 0 && (
                <div style={dashStyles.section}>
                  <h3 style={dashStyles.sectionTitle}>Quality Band Distribution</h3>
                  {["Outstanding", "Excellent", "Good", "Satisfactory", "Unsatisfactory"].map((band) => {
                    const count = bandCounts[band] || 0;
                    const maxBand = Math.max(...Object.values(bandCounts), 1);
                    const bandColor = {
                      Outstanding: "#1a7a3a", Excellent: "#2d6a4f",
                      Good: "#1b4965", Satisfactory: "#9e7a1a", Unsatisfactory: "#c1121f",
                    }[band] || "#888";
                    return (
                      <div key={band} style={dashStyles.barRow}>
                        <span style={{ ...dashStyles.barLabel, color: bandColor }}>{band}</span>
                        <div style={dashStyles.barTrack}>
                          <div
                            style={{
                              ...dashStyles.barFill,
                              width: `${(count / maxBand) * 100}%`,
                              backgroundColor: bandColor,
                            }}
                          />
                        </div>
                        <span style={dashStyles.barCount}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Common issues/tags */}
              {sortedTags.length > 0 && (
                <div style={dashStyles.section}>
                  <h3 style={dashStyles.sectionTitle}>Most Common Issues &amp; Strengths</h3>
                  {sortedTags.map(([tag, count]) => (
                    <div key={tag} style={dashStyles.barRow}>
                      <span style={dashStyles.barLabel}>{tag}</span>
                      <div style={dashStyles.barTrack}>
                        <div
                          style={{
                            ...dashStyles.barFill,
                            width: `${(count / maxTagBar) * 100}%`,
                            backgroundColor: "#7b2d8e",
                          }}
                        />
                      </div>
                      <span style={dashStyles.barCount}>{count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Top issues by pillar */}
              <div style={dashStyles.section}>
                <h3 style={dashStyles.sectionTitle}>Top Issues by Pillar</h3>
                {PILLARS.map((p) => {
                  const pillarTags = Object.entries(tagsByPillar[p.id] || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                  if (pillarTags.length === 0) return null;
                  return (
                    <div key={p.id} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: p.color, marginBottom: 6 }}>
                        {p.label}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {pillarTags.map(([tag, count]) => (
                          <span
                            key={tag}
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: 12,
                              fontSize: 12,
                              background: `${p.color}15`,
                              color: p.color,
                              border: `1px solid ${p.color}30`,
                            }}
                          >
                            {tag} ({count})
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Usage over time */}
              {sortedDays.length > 0 && (
                <div style={dashStyles.section}>
                  <h3 style={dashStyles.sectionTitle}>Usage Over Time</h3>
                  {sortedDays.map(([day, count]) => (
                    <div key={day} style={dashStyles.barRow}>
                      <span style={dashStyles.barLabel}>{day}</span>
                      <div style={dashStyles.barTrack}>
                        <div
                          style={{
                            ...dashStyles.barFill,
                            width: `${(count / maxDayBar) * 100}%`,
                            backgroundColor: "#1b4965",
                          }}
                        />
                      </div>
                      <span style={dashStyles.barCount}>{count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Export & Reset */}
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                {!showCsv && !showResetConfirm && (
                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      onClick={() => setShowCsv(true)}
                      style={{
                        padding: "8px 20px",
                        borderRadius: 8,
                        border: "1.5px solid #2d6a4f",
                        background: "#2d6a4f",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Export CSV
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      style={{
                        padding: "8px 20px",
                        borderRadius: 8,
                        border: "1.5px solid #c1121f",
                        background: "transparent",
                        color: "#c1121f",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Reset All Data
                    </button>
                  </div>
                )}

                {showCsv && (() => {
                  const headers = ["timestamp", "pillar", "focus", "wordCount", "band", "tags"];
                  const rows = entries.map((e) => [
                    e.timestamp || "",
                    e.pillar || "",
                    e.focus || "",
                    e.wordCount || "",
                    e.band || "",
                    (e.tags || []).join("; "),
                  ]);
                  const csv = [headers.join(","), ...rows.map((r) =>
                    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
                  )].join("\n");
                  return (
                    <div style={{ width: "100%" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>Copy this CSV data:</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => {
                              const ta = document.getElementById("csv-export-area");
                              if (ta) { ta.select(); document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); }
                            }}
                            style={{
                              padding: "5px 14px",
                              borderRadius: 6,
                              border: "none",
                              background: copied ? "#1a7a3a" : "#2d6a4f",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            {copied ? "Copied!" : "Copy"}
                          </button>
                          <button
                            onClick={() => setShowCsv(false)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 6,
                              border: "1.5px solid #ccc",
                              background: "transparent",
                              color: "#888",
                              fontSize: 12,
                              cursor: "pointer",
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                      <textarea
                        id="csv-export-area"
                        readOnly
                        value={csv}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          height: 160,
                          fontSize: 11,
                          fontFamily: "monospace",
                          padding: 10,
                          border: "1.5px solid #d5d0c8",
                          borderRadius: 8,
                          background: "#fafaf7",
                          resize: "vertical",
                          color: "#333",
                        }}
                      />
                    </div>
                  );
                })()}

                {showResetConfirm && (
                  <div style={{
                    padding: "14px 20px",
                    borderRadius: 8,
                    border: "1.5px solid #c1121f",
                    background: "#fdf0ef",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <span style={{ fontSize: 13, color: "#c1121f", fontWeight: 500 }}>
                      Clear all analytics data? This cannot be undone.
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await withTimeout(window.storage.delete("analytics:submissions", true));
                          setData([]);
                        } catch (e) {
                          console.error(e);
                        }
                        setShowResetConfirm(false);
                      }}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "#c1121f",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Yes, reset
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: "1.5px solid #ccc",
                        background: "transparent",
                        color: "#888",
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Feedback Card ---
function FeedbackCard({ feedback, isLoading }) {
  if (isLoading) {
    return (
      <div style={styles.feedbackCard}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Analysing your writing…</p>
        </div>
      </div>
    );
  }
  if (!feedback) return null;
  return (
    <div style={styles.feedbackCard}>
      <h3 style={styles.feedbackTitle}>Formative Feedback</h3>
      <div style={styles.feedbackContent}>
        {feedback.split("\n").map((line, i) => {
          if (!line.trim()) return <br key={i} />;
          if (line.startsWith("##")) {
            return <h4 key={i} style={styles.feedbackH4}>{line.replace(/^#+\s*/, "")}</h4>;
          }
          if (line.startsWith("**") && line.endsWith("**")) {
            return <p key={i} style={styles.feedbackBold}>{line.replace(/\*\*/g, "")}</p>;
          }
          const parts = line.split(/(\*\*.*?\*\*)/g);
          return (
            <p key={i} style={styles.feedbackP}>
              {parts.map((part, j) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={j}>{part.replace(/\*\*/g, "")}</strong>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </p>
          );
        })}
      </div>
      <div style={styles.disclaimer}>
        This is automated formative feedback to help you reflect on your draft.
        It does not represent your final grade or your professor's assessment.
      </div>
    </div>
  );
}

// --- Main Component ---
const MAX_SUBMISSIONS = 3;
const COOLDOWN_SECONDS = 120;

export default function FeedbackTool() {
  const [text, setText] = useState("");
  const [pillar, setPillar] = useState("opportunity");
  const [focus, setFocus] = useState("general");
  const [feedback, setFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [showDashboard, setShowDashboard] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const textareaRef = useRef(null);
  const cooldownRef = useRef(null);

  const wordCount = countWords(text);
  const isOverLimit = wordCount > WORD_LIMIT;
  const isAtLimit = submissionCount >= MAX_SUBMISSIONS;
  const isOnCooldown = cooldownRemaining > 0;
  const canSubmit = wordCount >= 30 && !isOverLimit && !isLoading && !isAtLimit && !isOnCooldown;

  const selectedPillar = PILLARS.find((p) => p.id === pillar);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    cooldownRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(cooldownRef.current);
  }, [cooldownRemaining > 0]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    setFeedback(null);
    setHasSubmitted(true);

    const focusLabel = FOCUS_OPTIONS.find((f) => f.id === focus)?.label || "";
    const pillarLabel = selectedPillar?.label || "";

    const userPrompt = `The student is working on the "${pillarLabel}" section of their funding pitch evaluation.

Their specific feedback request: "${focusLabel}"

Here is their writing sample (up to 300 words of draft):

---
${text}
---

Please provide formative feedback structured as follows:
1. **What's working well** (1-2 specific strengths you see in this sample)
2. **Critical evaluation check** (Is the student critically evaluating the pitch, or restating/selling? Give specific examples from their text.)
3. **Evidence and reasoning** (Comment on argument structure: do you see evidence → claim → warrant chains? Are sources used effectively?)
4. **Specific suggestions** (2-3 concrete, actionable things they could do to strengthen this section before submission)
5. **Quality indicator** (Without giving a grade, indicate which quality band this sample is trending toward — e.g. "This is trending toward Good/Excellent territory because..." or "This currently reads at a Satisfactory level because...")

Be encouraging but honest. Use specific quotes or references from their text to ground your feedback. Keep the total feedback to roughly 300-400 words.

Remember to append your diagnostic tags at the very end.`;

    try {
      const response = await withTimeout(fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: RUBRIC_CONTEXT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      }), 30000);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const rawResult = data.content
        .map((item) => (item.type === "text" ? item.text : ""))
        .filter(Boolean)
        .join("\n");

      const { cleanText, tags, band } = parseDiagnosticTags(rawResult);
      setFeedback(cleanText);
      setSubmissionCount((prev) => prev + 1);
      setCooldownRemaining(COOLDOWN_SECONDS);

      // Log analytics in background — don't block feedback display
      logSubmission(pillar, focus, wordCount, tags, band);
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("timeout")) {
        setError("The request timed out. Please try again in a moment.");
      } else {
        setError("Something went wrong generating feedback. Please try again.");
      }
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setText("");
    setFeedback(null);
    setError(null);
    setHasSubmitted(false);
    setFocus("general");
    setPillar("opportunity");
  }

  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  function handleAdminClick() {
    if (adminUnlocked) {
      setShowDashboard(true);
      return;
    }
    setShowPasswordInput(true);
    setPasswordError(false);
    setAdminPassword("");
  }

  function handlePasswordSubmit() {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setShowDashboard(true);
      setShowPasswordInput(false);
      setAdminPassword("");
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  }

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        textarea::placeholder { color: #999; font-style: italic; }
        textarea:focus { outline: none; border-color: #2d6a4f !important; box-shadow: 0 0 0 3px rgba(45,106,79,0.12) !important; }
      `}</style>

      <header style={styles.header}>
        <div style={styles.headerAccent} />
        <h1 style={styles.title}>Pitch Evaluation Feedback</h1>
        <p style={styles.subtitle}>
          Paste up to 300 words from your draft to receive formative feedback aligned with the assignment rubric.
        </p>
      </header>

      <main style={styles.main}>
        <div style={styles.controls}>
          <div style={styles.controlGroup}>
            <label style={styles.label}>Which section are you working on?</label>
            <div style={styles.pillarRow}>
              {PILLARS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPillar(p.id)}
                  style={{
                    ...styles.pillarChip,
                    backgroundColor: pillar === p.id ? p.color : "transparent",
                    color: pillar === p.id ? "#fff" : p.color,
                    borderColor: p.color,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>What feedback would be most helpful?</label>
            <div style={styles.focusRow}>
              {FOCUS_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFocus(f.id)}
                  style={{
                    ...styles.focusChip,
                    backgroundColor: focus === f.id ? "#2d6a4f" : "transparent",
                    color: focus === f.id ? "#fff" : "#2d6a4f",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={styles.editorContainer}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a section of your draft here (up to 300 words)…"
            style={styles.textarea}
            rows={10}
          />
          <div style={styles.editorFooter}>
            <span
              style={{
                ...styles.wordCount,
                color: isOverLimit ? "#c1121f" : wordCount > 250 ? "#e67e22" : "#888",
              }}
            >
              {wordCount} / {WORD_LIMIT} words
              {isOverLimit && " — over limit"}
            </span>
            <div style={styles.buttonRow}>
              {hasSubmitted && !isAtLimit && (
                <button onClick={handleReset} style={styles.resetBtn}>
                  Start over
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  ...styles.submitBtn,
                  opacity: canSubmit ? 1 : 0.45,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                {isLoading
                  ? "Analysing…"
                  : isAtLimit
                  ? "No uses remaining"
                  : isOnCooldown
                  ? `Wait ${Math.floor(cooldownRemaining / 60)}:${String(cooldownRemaining % 60).padStart(2, "0")}`
                  : "Get Feedback"}
              </button>
            </div>
          </div>
          {(submissionCount > 0 || isAtLimit) && (
            <div style={styles.usageBanner}>
              {isAtLimit
                ? "You've used all 3 feedback requests for this session. Reflect on the feedback you've received and continue drafting."
                : `${MAX_SUBMISSIONS - submissionCount} of ${MAX_SUBMISSIONS} feedback requests remaining this session`}
            </div>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <FeedbackCard feedback={feedback} isLoading={isLoading} />

        <footer style={styles.footer}>
          <p>
            <strong>How to use this tool:</strong> Select the pillar you're drafting, choose a feedback focus, and paste up to 300 words. You have 3 feedback requests per session, so choose which sections or revisions to test thoughtfully. The feedback is based on the assignment rubric and is designed to help you reflect and improve — it won't tell you exactly what to write, but it will flag where your analysis could go deeper.
          </p>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            This tool gives formative guidance only. Your final grade is determined by your professor using the full rubric.
          </p>
          <div style={{ marginTop: 12, textAlign: "right", minHeight: 32 }}>
            {showPasswordInput && !adminUnlocked ? (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => { setAdminPassword(e.target.value); setPasswordError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                  placeholder="Admin password"
                  autoFocus
                  style={{
                    padding: "5px 10px",
                    fontSize: 12,
                    border: `1.5px solid ${passwordError ? "#c1121f" : "#ccc"}`,
                    borderRadius: 6,
                    fontFamily: "'DM Sans', sans-serif",
                    width: 140,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handlePasswordSubmit}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    border: "none",
                    borderRadius: 6,
                    background: "#2d6a4f",
                    color: "#fff",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Go
                </button>
                <button
                  onClick={() => setShowPasswordInput(false)}
                  style={{
                    padding: "5px 8px",
                    fontSize: 12,
                    border: "none",
                    background: "transparent",
                    color: "#999",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <span
                onClick={handleAdminClick}
                style={{
                  fontSize: 11,
                  color: "#ccc",
                  cursor: "default",
                  userSelect: "none",
                }}
              >
                v2.1
              </span>
            )}
          </div>
        </footer>
      </main>

      {showDashboard && (
        <AnalyticsDashboard onClose={() => setShowDashboard(false)} />
      )}
    </div>
  );
}

// --- Main Styles ---
const styles = {
  page: {
    fontFamily: "'DM Sans', sans-serif",
    minHeight: "100vh",
    background: "#f7f5f0",
    color: "#1a1a1a",
  },
  header: {
    position: "relative",
    padding: "40px 32px 28px",
    borderBottom: "1px solid #e0dcd4",
    background: "#fffef9",
  },
  headerAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    background: "linear-gradient(90deg, #2d6a4f, #1b4965, #7b2d8e, #9e4a1a)",
  },
  title: {
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    color: "#1a1a1a",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginTop: 8,
    marginBottom: 0,
    lineHeight: 1.5,
    maxWidth: 600,
  },
  main: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "24px 24px 48px",
  },
  controls: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    marginBottom: 24,
  },
  controlGroup: {},
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 10,
  },
  pillarRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  pillarChip: {
    padding: "7px 16px",
    borderRadius: 20,
    border: "1.5px solid",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    fontFamily: "'DM Sans', sans-serif",
  },
  focusRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  focusChip: {
    padding: "7px 14px",
    borderRadius: 20,
    border: "1.5px solid #2d6a4f",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    fontFamily: "'DM Sans', sans-serif",
  },
  editorContainer: {
    borderRadius: 10,
    border: "1.5px solid #d5d0c8",
    background: "#fff",
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border: "none",
    padding: "20px",
    fontSize: 15,
    lineHeight: 1.7,
    fontFamily: "'DM Sans', sans-serif",
    color: "#1a1a1a",
    resize: "vertical",
    minHeight: 200,
    background: "transparent",
  },
  editorFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    borderTop: "1px solid #eee",
    background: "#fafaf7",
  },
  wordCount: {
    fontSize: 13,
    fontWeight: 500,
  },
  buttonRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  submitBtn: {
    padding: "9px 24px",
    borderRadius: 8,
    border: "none",
    background: "#2d6a4f",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "opacity 0.15s ease",
  },
  resetBtn: {
    padding: "9px 18px",
    borderRadius: 8,
    border: "1.5px solid #ccc",
    background: "transparent",
    color: "#666",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  error: {
    marginTop: 16,
    padding: "12px 16px",
    borderRadius: 8,
    background: "#fdf0ef",
    color: "#c1121f",
    fontSize: 14,
    border: "1px solid #f5c6c6",
  },
  feedbackCard: {
    marginTop: 24,
    padding: "28px",
    borderRadius: 10,
    background: "#fff",
    border: "1.5px solid #d5d0c8",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    animation: "fadeIn 0.3s ease",
  },
  feedbackTitle: {
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontSize: 20,
    fontWeight: 600,
    margin: "0 0 16px",
    color: "#2d6a4f",
  },
  feedbackContent: {
    lineHeight: 1.7,
    fontSize: 14.5,
  },
  feedbackH4: {
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontSize: 16,
    fontWeight: 600,
    margin: "20px 0 8px",
    color: "#1a1a1a",
  },
  feedbackBold: {
    fontWeight: 600,
    margin: "16px 0 6px",
  },
  feedbackP: {
    margin: "6px 0",
  },
  disclaimer: {
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid #eee",
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    lineHeight: 1.5,
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 0",
    gap: 16,
  },
  spinner: {
    width: 28,
    height: 28,
    border: "3px solid #e0dcd4",
    borderTopColor: "#2d6a4f",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    fontSize: 14,
    color: "#888",
  },
  footer: {
    marginTop: 32,
    padding: "20px 24px",
    borderRadius: 10,
    background: "#eeeae3",
    fontSize: 13,
    color: "#555",
    lineHeight: 1.6,
  },
  usageBanner: {
    padding: "10px 20px",
    fontSize: 13,
    color: "#7b6b55",
    background: "#f5f0e8",
    borderTop: "1px solid #e8e2d8",
    textAlign: "center",
    fontWeight: 500,
  },
};

// --- Dashboard Styles ---
const dashStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#fff",
    borderRadius: 14,
    width: "100%",
    maxWidth: 640,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    fontFamily: "'DM Sans', sans-serif",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 24px",
    borderBottom: "1px solid #eee",
  },
  modalTitle: {
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
    color: "#1a1a1a",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    color: "#999",
    padding: "4px 8px",
    borderRadius: 6,
  },
  scrollArea: {
    overflowY: "auto",
    padding: "20px 24px 28px",
  },
  statRow: {
    display: "flex",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    textAlign: "center",
    padding: "16px 12px",
    background: "#f7f5f0",
    borderRadius: 10,
    border: "1px solid #e8e4dc",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 700,
    color: "#2d6a4f",
    fontFamily: "'Source Serif 4', Georgia, serif",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontSize: 16,
    fontWeight: 600,
    color: "#1a1a1a",
    marginBottom: 12,
    marginTop: 0,
  },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: 500,
    width: 160,
    flexShrink: 0,
    color: "#444",
    textTransform: "capitalize",
  },
  barTrack: {
    flex: 1,
    height: 14,
    background: "#f0ede6",
    borderRadius: 7,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 7,
    transition: "width 0.3s ease",
    minWidth: 2,
  },
  barCount: {
    fontSize: 13,
    fontWeight: 600,
    color: "#555",
    width: 30,
    textAlign: "right",
    flexShrink: 0,
  },
};
