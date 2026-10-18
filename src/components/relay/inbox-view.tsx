"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, Chip, PendingButton } from "./kit";
import { Icon } from "./icons";
import { threads } from "@/features/_sample/data";

export function InboxView() {
  const [selected, setSelected] = useState(0);
  const t = threads[selected];
  return (
    <div className="card inbox">
      <div className="inbox-list">
        <div className="inbox-colhead">
          <h2>
            Inbox <span style={{ color: "#a0afaf", fontSize: 11 }}>· 8</span>
          </h2>
          <Icon name="filter" />
        </div>
        {threads.map((th, i) => (
          <button
            type="button"
            key={th.name}
            className={`thread${i === selected ? " selected" : ""}`}
            style={{ width: "100%", textAlign: "left", background: i === selected ? undefined : "transparent", border: 0, borderBottom: "1px solid #EEF1EF" }}
            aria-current={i === selected}
            onClick={() => setSelected(i)}
          >
            <Avatar name={th.name} tone={th.tone} />
            <div style={{ flex: 1 }}>
              <b>{th.name}</b>
              <small>WhatsApp · {th.owner}</small>
              <p>{th.preview}</p>
            </div>
            <span className="thread-time">{th.time}</span>
          </button>
        ))}
      </div>

      <div className="chat-panel">
        <div className="chat-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={t.name} tone={t.tone} />
            <div>
              <b style={{ color: "#29434b" }}>{t.name}</b>
              <div className="statline">WhatsApp · Assigned to {t.owner}</div>
            </div>
          </div>
          <Chip tone="green">Open</Chip>
        </div>
        <div className="chat-stage">
          <div className="dayline">TODAY · OCTOBER 18</div>
          <div className="message">
            Hi! I&apos;m interested in adding battery storage to our home. Could someone tell me about the options?
            <span className="msg-meta">10:18 · Incoming · WhatsApp</span>
          </div>
          <div className="message mine">
            Absolutely! I&apos;d be happy to help you compare options. Do you have a few minutes today for a quick call?
            <span className="msg-meta">10:20 · Sent · Delivered ✓✓</span>
          </div>
          <div className="message">
            {t.preview}
            <span className="msg-meta">10:23 · Incoming · WhatsApp</span>
          </div>
        </div>
        <div className="compose">
          <label className="compose-box" style={{ display: "block", padding: 0 }}>
            <span className="sr-only">Message</span>
            <textarea
              disabled
              placeholder={`Write a reply to ${t.name.split(" ")[0]}...`}
              style={{ width: "100%", height: "100%", border: 0, resize: "none", padding: 12, background: "transparent", font: "inherit", fontSize: 11 }}
            />
          </label>
          <div className="compose-actions">
            <span>WhatsApp sandbox · joined numbers only</span>
            <PendingButton style="small primary" note="Sending goes through verified Twilio and arrives with the messaging module.">
              Send reply <Icon name="arrow" />
            </PendingButton>
          </div>
        </div>
      </div>

      <div className="profile-aside">
        <div className="aside-center">
          <Avatar name={t.name} tone={t.tone} className="big-initial" />
          <b>{t.name}</b>
          <p>Existing customer · Atlas Solar</p>
        </div>
        <h3>Contact details</h3>
        <div className="aside-kv"><span>Lead source</span><b>Web form</b></div>
        <div className="aside-kv"><span>Assigned rep</span><b>{t.owner}</b></div>
        <div className="aside-kv"><span>Opportunity</span><b>Solar installation</b></div>
        <div className="aside-kv"><span>Stage</span><b>Proposal sent</b></div>
        <div className="ghost-divider" />
        <Link href="/contacts" className="btn small">
          Open full profile <Icon name="arrow" />
        </Link>
      </div>
    </div>
  );
}
