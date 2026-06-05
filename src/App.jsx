import { useState, useEffect, useRef } from "react";

// ── SUPABASE CLIENT ──────────────────────────────────────
const SUPABASE_URL = "https://dmwfqveckixsmedzpgzx.supabase.co";
const SUPABASE_KEY = "sb_publishable_67Usiozvwh1d8W1CYjQQ1Q_oOKMnHWY";

const supabase = {
  async from(table) {
    const base = `${SUPABASE_URL}/rest/v1/${table}`;
    const headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    };
    return {
      async select(cols = "*") {
        const res = await fetch(`${base}?select=${cols}`, { headers: { ...headers, "Prefer": "return=representation" } });
        return res.json();
      },
      async upsert(data) {
        const res = await fetch(base, {
          method: "POST",
          headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(Array.isArray(data) ? data : [data])
        });
        return res.ok;
      },
      async delete(match) {
        const params = Object.entries(match).map(([k,v]) => `${k}=eq.${v}`).join("&");
        const res = await fetch(`${base}?${params}`, { method: "DELETE", headers });
        return res.ok;
      },
      async deleteIn(col, vals) {
        if (!vals.length) return true;
        const params = `${col}=in.(${vals.join(",")})`;
        const res = await fetch(`${base}?${params}`, { method: "DELETE", headers });
        return res.ok;
      }
    };
  }
};

// ── STRIPE ───────────────────────────────────────────────
const STRIPE_KEY = "pk_live_51TZvFr8YdgY75kddI3aVTkfM52hpfzJvEKFWWWkrhaLtNximJ8fHYceAFvFatc2ODX3rPu0Q9ZnOy0d41SQp1elO00uJuUJOwk";

// ── SERVICE WORKER REGISTRATION ──────────────────────────
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then(reg => {
      console.log("SW registered:", reg.scope);
    }).catch(err => console.log("SW failed:", err));
  }
}

// ── PWA PUSH NOTIFICATIONS ────────────────────────────────
async function requestPushPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

// Send scheduled notification via Service Worker (works when app is closed)
async function scheduleViaSW(title, body, delayMs) {
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active) {
      reg.active.postMessage({ type: "SCHEDULE_NOTIFICATION", title, body, delayMs });
      return true;
    }
  }
  // Fallback: setTimeout (only works while app is open)
  setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  }, delayMs);
  return false;
}

function scheduleMedReminder(medName, timeLabel, customTime) {
  if (Notification.permission !== "granted") return;
  const timeMap = { Morning:"08:00", Afternoon:"13:00", Evening:"18:00", Bedtime:"21:00" };
  const target = customTime || timeMap[timeLabel] || "08:00";
  const [h, m] = target.split(":").map(Number);
  const now = new Date();
  const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (fire <= now) fire.setDate(fire.getDate() + 1);
  const delay = fire - now;
  scheduleViaSW(
    "💊 Vitamin Reminder",
    `Time to give ${medName} — ${timeLabel}`,
    delay
  );
}

function scheduleApptReminder(title, time, period) {
  if (Notification.permission !== "granted") return;
  const [h, m] = (time || "09:00").split(":").map(Number);
  let hour = h;
  if (period === "PM" && h !== 12) hour = h + 12;
  if (period === "AM" && h === 12) hour = 0;
  const now = new Date();
  const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, Math.max(0, m - 15), 0);
  if (fire <= now) fire.setDate(fire.getDate() + 1);
  const delay = fire - now;
  scheduleViaSW(
    "📅 Appointment Reminder",
    `${title} starts in 15 minutes!`,
    delay
  );
}

// Device ID — unique per device (stored in sessionStorage as fallback)
const getDeviceId = () => {
  let id = sessionStorage.getItem("sprout_device_id");
  if (!id) { id = "device_" + Math.random().toString(36).slice(2) + Date.now(); sessionStorage.setItem("sprout_device_id", id); }
  return id;
};
const DEVICE_ID = getDeviceId();

// ── THEMES ──────────────────────────────────────────────
const themes = [
  { id:"meadow",   name:"Meadow",   primary:"#7BC4A0", secondary:"#F0F7F4", accent:"#4A9B7A", bg:"#F7FBF9", card:"#FFFFFF", text:"#2D4A3E", soft:"#B8DDD0", emoji:"🌿" },
  { id:"sunrise",  name:"Sunrise",  primary:"#F4A56A", secondary:"#FEF6EE", accent:"#E8834A", bg:"#FFFAF5", card:"#FFFFFF", text:"#4A2E1A", soft:"#F9D4B4", emoji:"🌅" },
  { id:"lavender", name:"Lavender", primary:"#A78BCA", secondary:"#F5F0FB", accent:"#7C5BA8", bg:"#FAF7FD", card:"#FFFFFF", text:"#3A2558", soft:"#D4C4EC", emoji:"💜" },
  { id:"ocean",    name:"Ocean",    primary:"#5BA8D4", secondary:"#EFF7FD", accent:"#2E7FAF", bg:"#F5FAFE", card:"#FFFFFF", text:"#1A3A52", soft:"#B4D8F0", emoji:"🌊" },
];
const fonts = [
  { id:"round", name:"Friendly", style:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { id:"clean", name:"Clean",    style:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { id:"soft",  name:"Gentle",   style:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
];

// ── DIAGNOSIS CATEGORIES ────────────────────────────────
const diagnosisCategories = [
  { id:"developmental", label:"Developmental", icon:"🧠", diagnoses:[
    { id:"asd",   label:"Autism Spectrum (ASD)" },
    { id:"down",  label:"Down Syndrome" },
    { id:"delay", label:"Developmental Delay" },
    { id:"id",    label:"Intellectual Disability" },
  ]},
  { id:"behavioral", label:"Behavior & Attention", icon:"⚡", diagnoses:[
    { id:"adhd",    label:"ADHD" },
    { id:"odd",     label:"ODD" },
    { id:"conduct", label:"Conduct Disorder" },
  ]},
  { id:"language", label:"Language & Learning", icon:"🗣️", diagnoses:[
    { id:"speech",   label:"Speech & Language Disorder" },
    { id:"dyslexia", label:"Dyslexia" },
    { id:"ld",       label:"Learning Disability" },
  ]},
  { id:"sensory", label:"Sensory & Emotional", icon:"💙", diagnoses:[
    { id:"anxiety",  label:"Anxiety Disorder" },
    { id:"spd",      label:"Sensory Processing Disorder" },
    { id:"cp",       label:"Cerebral Palsy" },
    { id:"epilepsy", label:"Epilepsy / Seizure Disorder" },
  ]},
];

// ── RESEARCH-BASED BEHAVIOR CATEGORIES ──────────────────
const behaviorsByDiagnosis = {
  asd:{ label:"Autism (ASD)", color:"#7BC4A0", behaviors:[
    {id:"meltrecov", label:"Meltdown Recovered",      icon:"😮‍💨",color:"#7BC4A0"},
    {id:"senswin",   label:"Sensory Win",              icon:"🌟", color:"#FFD166"},
    {id:"eyecontact",label:"Eye Contact Made",         icon:"👀", color:"#5BA8D4"},
    {id:"respname",  label:"Responded to Name",        icon:"👂", color:"#F4A56A"},
    {id:"usedwords", label:"Used Words to Communicate",icon:"💬", color:"#7BC4A0"},
    {id:"socialinit",label:"Initiated Interaction",    icon:"🤝", color:"#5BA8D4"},
    {id:"sleepgood", label:"Slept Well",               icon:"😴", color:"#B4D8F0"},
    {id:"meltdown",  label:"Meltdown",                 icon:"😤", color:"#FF6B6B"},
    {id:"sensover",  label:"Sensory Overload",         icon:"🌀", color:"#A78BCA"},
    {id:"repbehav",  label:"Repetitive Behavior",      icon:"🔄", color:"#A78BCA"},
    {id:"aggrphys",  label:"Physical Aggression",      icon:"👊", color:"#FF6B6B"},
    {id:"selfharm",  label:"Self-Injurious Behavior",  icon:"🚨", color:"#FF6B6B"},
    {id:"eloped",    label:"Elopement / Running Away", icon:"🏃", color:"#FF6B6B"},
    {id:"sleepbad",  label:"Difficult Night / Sleep",  icon:"🌙", color:"#A78BCA"},
  ]},
  adhd:{ label:"ADHD", color:"#F4A56A", behaviors:[
    {id:"focused",   label:"Stayed Focused",           icon:"🎯", color:"#7BC4A0"},
    {id:"taskdone",  label:"Task Completed",           icon:"✅", color:"#5BA8D4"},
    {id:"waitedturn",label:"Waited Their Turn",        icon:"🙋", color:"#A78BCA"},
    {id:"calmedself",label:"Calmed Down on Own",       icon:"😌", color:"#7BC4A0"},
    {id:"medtaken",  label:"Medication Taken",         icon:"💊", color:"#B4D8F0"},
    {id:"impulsive", label:"Impulsive Moment",         icon:"⚡", color:"#F4A56A"},
    {id:"hyper",     label:"Hyperactive Episode",      icon:"🏃", color:"#FF6B6B"},
    {id:"emotional", label:"Emotional Outburst",       icon:"😭", color:"#FF6B6B"},
    {id:"lostfocus", label:"Lost Focus / Distracted",  icon:"😵", color:"#F4A56A"},
    {id:"interrupted",label:"Interrupted Others",      icon:"🗣️",color:"#F4A56A"},
    {id:"refusedtask",label:"Refused Task",            icon:"🚫", color:"#FF6B6B"},
    {id:"aggressive",label:"Aggressive Moment",        icon:"😠", color:"#FF6B6B"},
  ]},
  down:{ label:"Down Syndrome", color:"#A78BCA", behaviors:[
    {id:"newword",   label:"Said a New Word",          icon:"🗣️",color:"#7BC4A0"},
    {id:"followed",  label:"Followed Instructions",    icon:"👍", color:"#5BA8D4"},
    {id:"indplay",   label:"Played Independently",     icon:"🧸", color:"#F4A56A"},
    {id:"socialwin", label:"Social Interaction Win",   icon:"🤝", color:"#A78BCA"},
    {id:"selfcare",  label:"Self-Care Completed",      icon:"🌟", color:"#FFD166"},
    {id:"motorprog", label:"Motor Skill Progress",     icon:"🙌", color:"#5BA8D4"},
    {id:"toileting", label:"Toileting Success",        icon:"🏆", color:"#7BC4A0"},
    {id:"outburst",  label:"Emotional Outburst",       icon:"😭", color:"#FF6B6B"},
    {id:"refusedfood",label:"Refused Food / Eating",   icon:"🍽️",color:"#F4A56A"},
    {id:"stubbornness",label:"Stubbornness / Refusal", icon:"😤", color:"#FF6B6B"},
    {id:"attention", label:"Short Attention Span",     icon:"😵", color:"#A78BCA"},
    {id:"commfrust", label:"Communication Frustration",icon:"😠", color:"#FF6B6B"},
  ]},
  delay:{ label:"Developmental Delay", color:"#5BA8D4", behaviors:[
    {id:"milestone", label:"Milestone Reached",        icon:"🏆", color:"#FFD166"},
    {id:"commwin",   label:"Communication Win",        icon:"💬", color:"#7BC4A0"},
    {id:"motorprog", label:"Motor Skill Progress",     icon:"🙌", color:"#5BA8D4"},
    {id:"socialwin", label:"Social Win",               icon:"🤝", color:"#A78BCA"},
    {id:"focused",   label:"Focus Win",                icon:"🎯", color:"#F4A56A"},
    {id:"newskill",  label:"Learned New Skill",        icon:"📚", color:"#7BC4A0"},
    {id:"selfcare",  label:"Self-Care Win",            icon:"🌟", color:"#FFD166"},
    {id:"outburst",  label:"Emotional Outburst",       icon:"😭", color:"#FF6B6B"},
    {id:"regression",label:"Regression in Skill",      icon:"⬇️",color:"#FF6B6B"},
    {id:"commfrust", label:"Communication Frustration",icon:"😤", color:"#FF6B6B"},
    {id:"attention", label:"Difficulty with Attention",icon:"😵", color:"#A78BCA"},
    {id:"refusedtask",label:"Refused Activity",        icon:"🚫", color:"#F4A56A"},
  ]},
  id:{ label:"Intellectual Disability", color:"#FFD166", behaviors:[
    {id:"learning",  label:"Learning Moment",          icon:"📚", color:"#7BC4A0"},
    {id:"selfcare",  label:"Self-Care Win",            icon:"🌟", color:"#FFD166"},
    {id:"commwin",   label:"Communication Win",        icon:"💬", color:"#5BA8D4"},
    {id:"socialwin", label:"Social Interaction",       icon:"🤝", color:"#A78BCA"},
    {id:"motorprog", label:"Motor Skill Win",          icon:"🙌", color:"#F4A56A"},
    {id:"routine",   label:"Followed Routine",         icon:"📅", color:"#5BA8D4"},
    {id:"indep",     label:"Did It Independently",     icon:"💪", color:"#7BC4A0"},
    {id:"outburst",  label:"Emotional Outburst",       icon:"😭", color:"#FF6B6B"},
    {id:"aggression",label:"Aggressive Behavior",      icon:"👊", color:"#FF6B6B"},
    {id:"selfharm",  label:"Self-Injurious Behavior",  icon:"🚨", color:"#FF6B6B"},
    {id:"refusedtask",label:"Refused Task / Activity", icon:"🚫", color:"#F4A56A"},
    {id:"attention", label:"Difficulty Focusing",      icon:"😵", color:"#A78BCA"},
  ]},
  odd:{ label:"ODD", color:"#FF6B6B", behaviors:[
    {id:"complied",  label:"Compliance Win",           icon:"👍", color:"#7BC4A0"},
    {id:"calmedself",label:"Calmed Down on Own",       icon:"😌", color:"#7BC4A0"},
    {id:"socialpos", label:"Positive Interaction",     icon:"🤝", color:"#5BA8D4"},
    {id:"selfctrl",  label:"Self-Control Win",         icon:"🧘", color:"#A78BCA"},
    {id:"respectful",label:"Respectful Moment",        icon:"🌟", color:"#FFD166"},
    {id:"defiant",   label:"Defiant Moment",           icon:"😠", color:"#FF6B6B"},
    {id:"anger",     label:"Anger Outburst",           icon:"🌋", color:"#FF6B6B"},
    {id:"trigger",   label:"Trigger Identified",       icon:"⚠️", color:"#FFD166"},
    {id:"argued",    label:"Argued / Talked Back",     icon:"🗣️",color:"#FF6B6B"},
    {id:"destroyed", label:"Destroyed Property",       icon:"💥", color:"#FF6B6B"},
    {id:"blamed",    label:"Blamed Others",            icon:"👉", color:"#F4A56A"},
    {id:"vindictive",label:"Spiteful / Vindictive",    icon:"😈", color:"#A78BCA"},
  ]},
  conduct:{ label:"Conduct Disorder", color:"#FF6B6B", behaviors:[
    {id:"positive",  label:"Positive Behavior",        icon:"⭐", color:"#7BC4A0"},
    {id:"calmedself",label:"Calm Moment",              icon:"😌", color:"#A78BCA"},
    {id:"socialpos", label:"Social Win",               icon:"🤝", color:"#5BA8D4"},
    {id:"selfctrl",  label:"Self-Control Win",         icon:"🧘", color:"#7BC4A0"},
    {id:"empathy",   label:"Showed Empathy",           icon:"💙", color:"#5BA8D4"},
    {id:"rulefollow",label:"Followed Rules",           icon:"✅", color:"#7BC4A0"},
    {id:"aggression",label:"Aggression Noted",         icon:"👊", color:"#FF6B6B"},
    {id:"trigger",   label:"Trigger Identified",       icon:"⚠️", color:"#FFD166"},
    {id:"lying",     label:"Lying / Deception",        icon:"🤥", color:"#F4A56A"},
    {id:"stealing",  label:"Stealing Noted",           icon:"🚨", color:"#FF6B6B"},
    {id:"bullying",  label:"Bullying Behavior",        icon:"😤", color:"#FF6B6B"},
    {id:"destroyed", label:"Destroyed Property",       icon:"💥", color:"#FF6B6B"},
  ]},
  speech:{ label:"Speech & Language", color:"#5BA8D4", behaviors:[
    {id:"newword",   label:"New Word Used!",           icon:"🗣️",color:"#7BC4A0"},
    {id:"sentence",  label:"Full Sentence!",           icon:"💬", color:"#5BA8D4"},
    {id:"listening", label:"Listened Well",            icon:"👂", color:"#A78BCA"},
    {id:"therapywin",label:"Therapy Win",              icon:"🏆", color:"#FFD166"},
    {id:"socialinit",label:"Initiated Conversation",   icon:"🤝", color:"#F4A56A"},
    {id:"understood",label:"Was Understood",           icon:"😊", color:"#7BC4A0"},
    {id:"tryagain",  label:"Tried Again After Fail",   icon:"💪", color:"#5BA8D4"},
    {id:"frustrated",label:"Communication Frustration",icon:"😤", color:"#FF6B6B"},
    {id:"notunderstd",label:"Not Understood",          icon:"😕", color:"#FF6B6B"},
    {id:"refusedspk",label:"Refused to Speak",        icon:"🤐", color:"#A78BCA"},
    {id:"meltcomm",  label:"Meltdown from Frustration",icon:"😭",color:"#FF6B6B"},
    {id:"echolalia", label:"Echolalia Episode",        icon:"🔁", color:"#F4A56A"},
  ]},
  dyslexia:{ label:"Dyslexia", color:"#F4A56A", behaviors:[
    {id:"readwin",   label:"Reading Win",              icon:"📖", color:"#7BC4A0"},
    {id:"writewin",  label:"Writing Win",              icon:"✏️", color:"#5BA8D4"},
    {id:"focused",   label:"Focus Win",                icon:"🎯", color:"#A78BCA"},
    {id:"confidence",label:"Confidence Boost",         icon:"💪", color:"#FFD166"},
    {id:"therapywin",label:"Therapy Win",              icon:"🏆", color:"#F4A56A"},
    {id:"persistence",label:"Kept Trying",             icon:"🌟", color:"#7BC4A0"},
    {id:"taskdone",  label:"Assignment Completed",     icon:"✅", color:"#5BA8D4"},
    {id:"frustrated",label:"Frustration Moment",       icon:"😤", color:"#FF6B6B"},
    {id:"avoidread", label:"Avoided Reading/Writing",  icon:"🙈", color:"#FF6B6B"},
    {id:"lostplace", label:"Lost Place / Confused",    icon:"😵", color:"#A78BCA"},
    {id:"gaveupearly",label:"Gave Up Early",           icon:"🚫", color:"#F4A56A"},
    {id:"cried",     label:"Cried / Got Upset",        icon:"😢", color:"#FF6B6B"},
  ]},
  ld:{ label:"Learning Disability", color:"#A78BCA", behaviors:[
    {id:"learningwin",label:"Learning Win",            icon:"📚", color:"#7BC4A0"},
    {id:"focused",   label:"Focus Win",                icon:"🎯", color:"#5BA8D4"},
    {id:"confidence",label:"Confidence Boost",         icon:"💪", color:"#A78BCA"},
    {id:"taskdone",  label:"Task Completed",           icon:"✅", color:"#FFD166"},
    {id:"socialwin", label:"Social Win",               icon:"🤝", color:"#F4A56A"},
    {id:"askedhelp", label:"Asked for Help",           icon:"🙋", color:"#7BC4A0"},
    {id:"persistence",label:"Kept Trying",             icon:"🌟", color:"#5BA8D4"},
    {id:"frustrated",label:"Frustration Moment",       icon:"😤", color:"#FF6B6B"},
    {id:"gaveupearly",label:"Gave Up Early",           icon:"🚫", color:"#F4A56A"},
    {id:"avoidtask", label:"Avoided Task",             icon:"🙈", color:"#FF6B6B"},
    {id:"cried",     label:"Cried / Got Upset",        icon:"😢", color:"#FF6B6B"},
    {id:"attention", label:"Difficulty Focusing",      icon:"😵", color:"#A78BCA"},
  ]},
  anxiety:{ label:"Anxiety Disorder", color:"#B4D8F0", behaviors:[
    {id:"calmwin",   label:"Calm Win",                 icon:"😌", color:"#7BC4A0"},
    {id:"brave",     label:"Brave Moment",             icon:"💪", color:"#5BA8D4"},
    {id:"socialwin", label:"Social Win",               icon:"🤝", color:"#F4A56A"},
    {id:"copingused",label:"Used Coping Strategy",     icon:"🧘", color:"#7BC4A0"},
    {id:"trigger",   label:"Trigger Identified",       icon:"⚠️", color:"#FFD166"},
    {id:"anxious",   label:"Anxious Moment",           icon:"😰", color:"#FF6B6B"},
    {id:"avoidance", label:"Avoidance Behavior",       icon:"🙈", color:"#A78BCA"},
    {id:"worried",   label:"Worried / Racing Thoughts",icon:"💭", color:"#A78BCA"},
    {id:"panicattk", label:"Panic Attack",             icon:"😱", color:"#FF6B6B"},
    {id:"refusedgo", label:"Refused to Go / Attend",   icon:"🚫", color:"#FF6B6B"},
    {id:"cried",     label:"Cried / Distressed",       icon:"😢", color:"#FF6B6B"},
    {id:"clinging",  label:"Clingy / Separation Anxiety",icon:"🤗",color:"#F4A56A"},
  ]},
  spd:{ label:"Sensory Processing (SPD)", color:"#A78BCA", behaviors:[
    {id:"selfregwin",label:"Self-Regulated Well",      icon:"🌟", color:"#7BC4A0"},
    {id:"toleratnew",label:"Tolerated New Sensation",  icon:"👏", color:"#5BA8D4"},
    {id:"calmstrat", label:"Calming Strategy Worked",  icon:"😌", color:"#7BC4A0"},
    {id:"routine",   label:"Daily Routine Completed",  icon:"✅", color:"#FFD166"},
    {id:"senswin",   label:"Sensory Win",              icon:"🎉", color:"#F4A56A"},
    {id:"sensover",  label:"Sensory Overload",         icon:"🌀", color:"#FF6B6B"},
    {id:"sensavoid", label:"Sensory Avoidance",        icon:"🙅", color:"#A78BCA"},
    {id:"meltdown",  label:"Meltdown",                 icon:"😤", color:"#FF6B6B"},
    {id:"touchsens", label:"Tactile Sensitivity",      icon:"🤚", color:"#F4A56A"},
    {id:"soundsens", label:"Sound Sensitivity",        icon:"👂", color:"#A78BCA"},
    {id:"foodsens",  label:"Food / Texture Issue",     icon:"🍽️",color:"#FF6B6B"},
    {id:"overwhelm", label:"Overwhelmed in Crowd",     icon:"😵", color:"#FF6B6B"},
  ]},
  cp:{ label:"Cerebral Palsy", color:"#5BA8D4", behaviors:[
    {id:"motorprog", label:"Movement Progress",        icon:"🚶", color:"#7BC4A0"},
    {id:"ptwin",     label:"Physical Therapy Win",     icon:"🏆", color:"#FFD166"},
    {id:"commwin",   label:"Communication Win",        icon:"💬", color:"#5BA8D4"},
    {id:"selfcare",  label:"Self-Care Progress",       icon:"🌟", color:"#FFD166"},
    {id:"balance",   label:"Good Balance / Posture",   icon:"⚖️", color:"#7BC4A0"},
    {id:"pain",      label:"Pain / Discomfort",        icon:"😢", color:"#FF6B6B"},
    {id:"sensreact", label:"Sensory Reaction",         icon:"🌀", color:"#A78BCA"},
    {id:"fatigue",   label:"Fatigue Noted",            icon:"😴", color:"#B4D8F0"},
    {id:"spasm",     label:"Spasm / Stiffness",        icon:"⚡", color:"#FF6B6B"},
    {id:"fallinjury",label:"Fall / Injury",            icon:"🩹", color:"#FF6B6B"},
    {id:"refusedpt", label:"Refused Therapy",          icon:"🚫", color:"#F4A56A"},
  ]},
  epilepsy:{ label:"Epilepsy / Seizures", color:"#FF6B6B", behaviors:[
    {id:"seizfree",  label:"Seizure-Free Day 🌟",      icon:"✨", color:"#7BC4A0"},
    {id:"medtaken",  label:"Medication Taken ✓",       icon:"💊", color:"#5BA8D4"},
    {id:"normalday", label:"Normal Activity Day",      icon:"😊", color:"#7BC4A0"},
    {id:"sleepgood", label:"Slept Well",               icon:"🌙", color:"#B4D8F0"},
    {id:"moodafter", label:"Good Mood",                icon:"😄", color:"#F4A56A"},
    {id:"seizure",   label:"Seizure Episode",          icon:"⚡", color:"#FF6B6B"},
    {id:"postfatigue",label:"Post-Seizure Fatigue",    icon:"😴", color:"#A78BCA"},
    {id:"trigger",   label:"Trigger Identified",       icon:"⚠️", color:"#FFD166"},
    {id:"missedmed", label:"Missed Medication",        icon:"🚨", color:"#FF6B6B"},
    {id:"sleepbad",  label:"Poor Sleep / Disrupted",   icon:"😵", color:"#FF6B6B"},
    {id:"moodbad",   label:"Mood Disruption After",    icon:"😤", color:"#F4A56A"},
  ]},
  general:{ label:"General", color:"#7BC4A0", behaviors:[
    {id:"positive",  label:"Positive Moment",          icon:"⭐", color:"#7BC4A0"},
    {id:"challenging",label:"Challenging Moment",      icon:"😤", color:"#FF6B6B"},
    {id:"socialwin", label:"Social Win",               icon:"🤝", color:"#5BA8D4"},
    {id:"focused",   label:"Focus Win",                icon:"🎯", color:"#F4A56A"},
    {id:"emotional", label:"Emotional Moment",         icon:"💙", color:"#A78BCA"},
    {id:"milestone", label:"Milestone!",               icon:"🏆", color:"#FFD166"},
    {id:"outburst",  label:"Emotional Outburst",       icon:"😭", color:"#FF6B6B"},
    {id:"refusedtask",label:"Refused Task",            icon:"🚫", color:"#FF6B6B"},
  ]},
};

function getBehaviorSections(diagnosisIds) {
  if (!diagnosisIds || diagnosisIds.length === 0)
    return [{ diagId:"general", label:"General", color:"#7BC4A0", behaviors: behaviorsByDiagnosis.general.behaviors }];
  return diagnosisIds.map(id => {
    const d = behaviorsByDiagnosis[id] || behaviorsByDiagnosis.general;
    return { diagId: id, label: d.label, color: d.color, behaviors: d.behaviors };
  });
}

// ── POSITIVE BEHAVIOR IDs ────────────────────────────────
const positiveBehaviorIds = new Set([
  "meltrecov","senswin","eyecontact","respname","usedwords","socialinit","sleepgood",
  "focused","taskdone","waitedturn","calmedself","medtaken",
  "newword","followed","indplay","socialwin","selfcare","motorprog","toileting",
  "milestone","commwin","newskill","indep","routine","learning",
  "complied","socialpos","selfctrl","respectful","empathy","rulefollow",
  "sentence","listening","therapywin","understood","tryagain",
  "readwin","writewin","confidence","persistence","learningwin","askedhelp",
  "calmwin","brave","copingused",
  "selfregwin","toleratnew","calmstrat",
  "ptwin","balance",
  "seizfree","normalday","moodafter","sleepgood",
  "positive","milestone",
]);

const isPositive = (log) => {
  if (log.behavior?.id && positiveBehaviorIds.has(log.behavior.id)) return true;
  const label = (log.behavior?.label || "").toLowerCase();
  return ["win","completed","success","responded","used words","initiated","waited",
    "calmed","followed","played","said","full sentence","brave","progress",
    "milestone","seizure-free","normal","kept trying","focused","did it",
    "confident","respectful","empathy","tried again","understood","new word",
    "therapy win","self-care","motor","positive"].some(kw => label.includes(kw));
};

// ── FOOD REACTIONS ───────────────────────────────────────
const foodReactions = [
  { id:"liked",    label:"Loved it 😊",   color:"#7BC4A0" },
  { id:"disliked", label:"Refused 😤",    color:"#FF6B6B" },
  { id:"new",      label:"First time 🆕", color:"#5BA8D4" },
  { id:"allergy",  label:"Reaction ⚠️",   color:"#FFD166" },
  { id:"neutral",  label:"Just ok 😐",    color:"#A78BCA" },
];
const mealTimes = ["Breakfast","Lunch","Dinner","Snack"];
const medTimes  = ["Morning","Afternoon","Evening","Bedtime"];
const apptColors = ["#5BA8D4","#7BC4A0","#A78BCA","#F4A56A","#FF6B6B","#FFD166"];
const medColorPalette = ["#5BA8D4","#A78BCA","#F4A56A","#FF6B6B","#7BC4A0","#FFD166"];

// ── STORAGE — Supabase powered ───────────────────────────
const STORAGE_KEY = "sprout_v2";
// Keep localStorage as fast cache, Supabase as persistent store
function loadData() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveLocalCache(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }

async function syncToSupabase(data, deviceId) {
  try {
    const db = await supabase.from("sprout_profiles");
    await db.upsert({
      id: deviceId,
      child_name: data.childName || "",
      child_age: data.childAge || "",
      selected_diagnoses: data.selectedDiagnoses || [],
      theme_id: data.themeId || "meadow",
      font_id: data.fontId || "round",
      updated_at: new Date().toISOString()
    });
  } catch(e) { console.warn("Supabase profile sync failed", e); }
}

async function syncLogsToSupabase(logs, deviceId) {
  try {
    if (!logs.length) return;
    const db = await supabase.from("sprout_logs");
    await db.upsert(logs.map(l => ({
      id: l.id, profile_id: deviceId,
      behavior: l.behavior, note: l.note || "",
      time: l.time, iso_date: l.isoDate || "", date: l.date || ""
    })));
  } catch(e) { console.warn("Supabase logs sync failed", e); }
}

async function syncMedsToSupabase(meds, deviceId) {
  try {
    if (!meds.length) return;
    const db = await supabase.from("sprout_medications");
    await db.upsert(meds.map(m => ({
      id: m.id, profile_id: deviceId,
      name: m.name, dose: m.dose || "",
      times: m.times, type: m.type
    })));
  } catch(e) { console.warn("Supabase meds sync failed", e); }
}

async function syncMedLogsToSupabase(medLogs, deviceId) {
  try {
    if (!medLogs.length) return;
    const db = await supabase.from("sprout_med_logs");
    await db.upsert(medLogs.map(k => ({ id: `${deviceId}_${k}`, profile_id: deviceId })));
  } catch(e) { console.warn("Supabase medLogs sync failed", e); }
}

async function syncNutritionToSupabase(nutritionLogs, deviceId) {
  try {
    if (!nutritionLogs.length) return;
    const db = await supabase.from("sprout_nutrition_logs");
    await db.upsert(nutritionLogs.map(l => ({
      id: l.id, profile_id: deviceId,
      name: l.name, reaction: l.reaction,
      texture: l.texture || "", temp: l.temp || "",
      behavior_note: l.behaviorNote || "",
      meal_time: l.mealTime, iso_date: l.isoDate || "", time: l.time || ""
    })));
  } catch(e) { console.warn("Supabase nutrition sync failed", e); }
}

async function syncAppointmentsToSupabase(appointments, deviceId) {
  try {
    if (!appointments.length) return;
    const db = await supabase.from("sprout_appointments");
    await db.upsert(appointments.map(a => ({
      id: a.id, profile_id: deviceId,
      title: a.title, therapist: a.therapist || "",
      time: a.time, period: a.period,
      color: a.color, repeat: a.repeat, done: a.done
    })));
  } catch(e) { console.warn("Supabase appointments sync failed", e); }
}

async function loadFromSupabase(deviceId) {
  try {
    const profileDb = await supabase.from("sprout_profiles");
    const profiles = await profileDb.select("*");
    const profile = Array.isArray(profiles) ? profiles.find(p => p.id === deviceId) : null;

    const logsDb = await supabase.from("sprout_logs");
    const logs = await logsDb.select("*");

    const medsDb = await supabase.from("sprout_medications");
    const meds = await medsDb.select("*");

    const medLogsDb = await supabase.from("sprout_med_logs");
    const medLogsRaw = await medLogsDb.select("*");

    const nutritionDb = await supabase.from("sprout_nutrition_logs");
    const nutrition = await nutritionDb.select("*");

    const apptDb = await supabase.from("sprout_appointments");
    const appts = await apptDb.select("*");

    const medEffectsDb = await supabase.from("sprout_med_effects");
    const medEffects = await medEffectsDb.select("*");

    const medSideEffectsDb = await supabase.from("sprout_med_side_effects");
    const medSideEffects = await medSideEffectsDb.select("*");

    return {
      profile,
      logs: Array.isArray(logs) ? logs.filter(l=>l.profile_id===deviceId).map(l=>({ id:l.id, behavior:l.behavior, note:l.note, time:l.time, isoDate:l.iso_date, date:l.date })) : [],
      medications: Array.isArray(meds) ? meds.filter(m=>m.profile_id===deviceId).map(m=>({ id:m.id, name:m.name, dose:m.dose, times:m.times, type:m.type })) : [],
      medLogs: Array.isArray(medLogsRaw) ? medLogsRaw.filter(k=>k.profile_id===deviceId).map(k=>k.id.replace(`${deviceId}_`,"")) : [],
      nutritionLogs: Array.isArray(nutrition) ? nutrition.filter(l=>l.profile_id===deviceId).map(l=>({ id:l.id, name:l.name, reaction:l.reaction, texture:l.texture, temp:l.temp, behaviorNote:l.behavior_note, mealTime:l.meal_time, isoDate:l.iso_date, time:l.time })) : [],
      appointments: Array.isArray(appts) ? appts.filter(a=>a.profile_id===deviceId).map(a=>({ id:a.id, title:a.title, therapist:a.therapist, time:a.time, period:a.period, color:a.color, repeat:a.repeat, done:a.done })) : [],
      medEffects: Array.isArray(medEffects) ? Object.fromEntries(medEffects.filter(e=>e.profile_id===deviceId).map(e=>[e.id.replace(`${deviceId}_`,""),e.value])) : {},
      medSideEffects: Array.isArray(medSideEffects) ? Object.fromEntries(medSideEffects.filter(e=>e.profile_id===deviceId).map(e=>[e.id.replace(`${deviceId}_`,""),e.value])) : {},
    };
  } catch(e) { console.warn("Supabase load failed", e); return null; }
}

// ── HELPERS ──────────────────────────────────────────────
const toIso = (d = new Date()) => d.toISOString().split("T")[0];
const todayIso = toIso();
const yesterdayIso = toIso(new Date(Date.now() - 86400000));

function getDisplayDate(log) {
  const d = log.isoDate;
  if (!d) return log.date || "";
  if (d === todayIso) return "Today";
  if (d === yesterdayIso) return "Yesterday";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" });
}

// ── MAIN APP ─────────────────────────────────────────────
export default function SproutApp() {
  const saved = loadData();

  // ── Core state ──
  const [step,   setStep]   = useState(saved ? 5 : 0);
  const [theme,  setTheme]  = useState(() => themes.find(t => t.id === saved?.themeId)  || themes[0]);
  const [font,   setFont]   = useState(() => fonts.find(f  => f.id === saved?.fontId)   || fonts[0]);
  const [childName, setChildName] = useState(saved?.childName || "");
  const [childAge,  setChildAge]  = useState(saved?.childAge  || "");
  const [selectedDiagnoses, setSelectedDiagnoses] = useState(saved?.selectedDiagnoses || []);
  const [openCat, setOpenCat] = useState(null);


  // ── Tracking mode: "specific" (special needs) or "simple" (general) ──
  const [trackingMode, setTrackingMode] = useState(saved?.trackingMode || "specific");

  // ── Multi-child profiles ──
  const [children, setChildren] = useState(saved?.children || []);
  const [activeChildId, setActiveChildId] = useState(saved?.activeChildId || null);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [newChildAge, setNewChildAge] = useState("");
  const [newChildMode, setNewChildMode] = useState("specific");

  // ── Simple tracking state ──
  const [moodLogs, setMoodLogs] = useState(saved?.moodLogs || []);
  const [praiseLogs, setPraiseLogs] = useState(saved?.praiseLogs || []);
  const [growthLogs, setGrowthLogs] = useState(saved?.growthLogs || []);
  const [showMoodForm, setShowMoodForm] = useState(false);
  const [showPraiseForm, setShowPraiseForm] = useState(false);
  const [showGrowthForm, setShowGrowthForm] = useState(false);
  const [newPraise, setNewPraise] = useState("");
  const [newHeight, setNewHeight] = useState("");
  const [newWeight, setNewWeight] = useState("");
  // ── Navigation ──
  const [activeTab,      setActiveTab]      = useState("home");
  const [showReport,     setShowReport]     = useState(false);
  const [trackSubTab,    setTrackSubTab]    = useState("meds");
  const [progressSubTab, setProgressSubTab] = useState("behavior");

  // ── Behavior logs ──
  const [logs, setLogs] = useState(saved?.logs || [
    { id:1, behavior:{id:"socialwin",label:"Social Win",icon:"🤝",color:"#7BC4A0",diagLabel:""}, note:"Said hello to neighbor!", time:"9:14 AM", isoDate:todayIso, date:"Today" },
    { id:2, behavior:{id:"focused",  label:"Focus Win", icon:"🎯",color:"#F4A56A",diagLabel:""}, note:"Sat through full story time", time:"2:30 PM", isoDate:todayIso, date:"Today" },
    { id:3, behavior:{id:"meltdown", label:"Meltdown",  icon:"😤",color:"#FF6B6B",diagLabel:""}, note:"Transition from park was hard", time:"5:45 PM", isoDate:yesterdayIso, date:"Yesterday" },
    { id:4, behavior:{id:"milestone",label:"Milestone!",icon:"🏆",color:"#FFD166",diagLabel:""}, note:"Used words instead of crying!", time:"8:00 AM", isoDate:yesterdayIso, date:"Yesterday" },
  ]);
  const [selectedBehaviors, setSelectedBehaviors] = useState([]);
  const [logNote, setLogNote] = useState("");
  const [showLogForm, setShowLogForm] = useState(false);
  const [confirmDeleteLog, setConfirmDeleteLog] = useState(null);

  // ── Appointments ──
  const [appointments, setAppointments] = useState(saved?.appointments || [
    { id:1, title:"Speech Therapy", therapist:"Ms. Jennifer", time:"09:00", period:"AM", color:"#5BA8D4", repeat:"weekly", done:false },
    { id:2, title:"OT Session",     therapist:"Mr. David",    time:"11:30", period:"AM", color:"#7BC4A0", repeat:"weekly", done:false },
    { id:3, title:"ABA Therapy",    therapist:"Dr. Sarah",    time:"04:30", period:"PM", color:"#A78BCA", repeat:"weekly", done:false },
  ]);
  const [showApptForm,    setShowApptForm]    = useState(false);
  const [editAppt,        setEditAppt]        = useState(null);
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(null);
  const [newAppt, setNewAppt] = useState({ title:"", therapist:"", time:"", period:"AM", color:"#5BA8D4", repeat:"weekly" });
  const [scheduleView,    setScheduleView]    = useState("list");
  const [selectedCalDate, setSelectedCalDate] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date());

  // ── Medications ──
  const [medications,    setMedications]    = useState(saved?.medications    || []);
  const [medLogs,        setMedLogs]        = useState(saved?.medLogs        || []);
  const [medEffects,     setMedEffects]     = useState(saved?.medEffects     || {});
  const [medSideEffects, setMedSideEffects] = useState(saved?.medSideEffects || {});
  const [showMedForm,    setShowMedForm]    = useState(false);
  const [newMed, setNewMed] = useState({ name:"", dose:"", times:["Morning"], type:"regular", customTimes:{"Morning":"08:00","Afternoon":"13:00","Evening":"18:00","Bedtime":"21:00"} });

  // ── Nutrition ──
  const [nutritionLogs,     setNutritionLogs]     = useState(saved?.nutritionLogs     || []);
  const [showNutritionForm, setShowNutritionForm] = useState(false);
  const [newFood, setNewFood] = useState({ name:"", reaction:"liked", texture:"", temp:"", behaviorNote:"", mealTime:"Breakfast" });

  // ── Subscription ──
  const [subStatus, setSubStatus] = useState(() => {
    const s = localStorage.getItem("sprout_sub");
    return s ? JSON.parse(s) : { status: "trial", trialStart: Date.now() };
  });
  const [showPaywall, setShowPaywall] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(Notification?.permission === "granted");

  // Check trial expiry
  useEffect(() => {
    const { status, trialStart } = subStatus;
    if (status === "trial") {
      const daysUsed = (Date.now() - trialStart) / (1000 * 60 * 60 * 24);
      if (daysUsed > 7) setShowPaywall(true);
    }
  }, []);

  const trialDaysLeft = Math.max(0, 7 - Math.floor((Date.now() - subStatus.trialStart) / (1000 * 60 * 60 * 24)));
  const isSubscribed = subStatus.status === "active";

  const enablePush = async () => {
    const ok = await requestPushPermission();
    setPushEnabled(ok);
    if (ok && medications.length > 0) {
      medications.forEach(med => med.times.forEach(t => scheduleMedReminder(med.name, t)));
    }
    if (ok && appointments.length > 0) {
      appointments.forEach(a => scheduleApptReminder(a.title, a.time, a.period));
    }
  };

  // ── Loading state ──
  const [isLoading, setIsLoading] = useState(true);
  const syncTimeout = useRef(null);

  // Load from Supabase on mount
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);

      // ── 로컬 캐시 먼저 로드 (즉시) ──
      const localData = saved;
      if (localData?.childName) {
        setChildName(localData.childName || "");
        setChildAge(localData.childAge || "");
        setSelectedDiagnoses(localData.selectedDiagnoses || []);
        setTheme(themes.find(t=>t.id===localData.themeId)||themes[0]);
        setFont(fonts.find(f=>f.id===localData.fontId)||fonts[0]);
        setTrackingMode(localData.trackingMode || "specific");
        if (localData.logs?.length) setLogs(localData.logs);
        if (localData.medications?.length) setMedications(localData.medications);
        if (localData.medLogs?.length) setMedLogs(localData.medLogs);
        if (localData.nutritionLogs?.length) setNutritionLogs(localData.nutritionLogs);
        if (localData.appointments?.length) setAppointments(localData.appointments);
        if (localData.moodLogs?.length) setMoodLogs(localData.moodLogs);
        if (localData.praiseLogs?.length) setPraiseLogs(localData.praiseLogs);
        if (localData.growthLogs?.length) setGrowthLogs(localData.growthLogs);
        setStep(5);
        setIsLoading(false); // 로컬 데이터로 즉시 표시!
      }

      // ── Supabase 백그라운드 동기화 (타임아웃 5초) ──
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        );
        const data = await Promise.race([loadFromSupabase(DEVICE_ID), timeoutPromise]);
        if (data && data.profile) {
          const p = data.profile;
          setChildName(p.child_name || "");
          setChildAge(p.child_age || "");
          setSelectedDiagnoses(p.selected_diagnoses || []);
          setTheme(themes.find(t=>t.id===p.theme_id)||themes[0]);
          setFont(fonts.find(f=>f.id===p.font_id)||fonts[0]);
          setStep(5);
        }
        if (data && data.logs?.length) setLogs(data.logs);
        if (data && data.medications?.length) setMedications(data.medications);
        if (data && data.medLogs?.length) setMedLogs(data.medLogs);
        if (data && data.nutritionLogs?.length) setNutritionLogs(data.nutritionLogs);
        if (data && data.appointments?.length) setAppointments(data.appointments);
        if (data && data.medEffects) setMedEffects(data.medEffects);
        if (data && data.medSideEffects) setMedSideEffects(data.medSideEffects);
      } catch (e) {
        console.log("Supabase sync skipped:", e.message);
      }

      setIsLoading(false);
    };
    init();
    // Register Service Worker
    registerSW();
  }, []);

  // ── Persist — debounced Supabase sync ──
  useEffect(() => {
    if (isLoading) return;
    // Save to local cache immediately
    saveLocalCache({ themeId:theme.id, fontId:font.id, childName, childAge, selectedDiagnoses, logs, appointments, medications, medLogs, medEffects, medSideEffects, nutritionLogs, trackingMode, children, activeChildId, moodLogs, praiseLogs, growthLogs });
    // Debounce Supabase sync (2 seconds)
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(async () => {
      if (step === 5) {
        await syncToSupabase({ themeId:theme.id, fontId:font.id, childName, childAge, selectedDiagnoses }, DEVICE_ID);
        await syncLogsToSupabase(logs, DEVICE_ID);
        await syncMedsToSupabase(medications, DEVICE_ID);
        await syncMedLogsToSupabase(medLogs, DEVICE_ID);
        await syncNutritionToSupabase(nutritionLogs, DEVICE_ID);
        await syncAppointmentsToSupabase(appointments, DEVICE_ID);
      }
    }, 2000);
  }, [step, theme, font, childName, childAge, selectedDiagnoses, logs, appointments, medications, medLogs, medEffects, medSideEffects, nutritionLogs]);

  // ── Behavior log helpers ──
  const toggleBehavior = (b, diagLabel) => {
    const key = b.id + "_" + diagLabel;
    setSelectedBehaviors(prev => prev.some(x => x._key === key) ? prev.filter(x => x._key !== key) : [...prev, {...b, diagLabel, _key: key}]);
  };
  const isBehaviorSelected = (b, diagLabel) => selectedBehaviors.some(x => x._key === b.id + "_" + diagLabel);

  const saveLog = () => {
    if (selectedBehaviors.length === 0) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const newLogs = selectedBehaviors.map((b, i) => ({
      id: Date.now() + i,
      behavior: { id:b.id, label:b.label, icon:b.icon, color:b.color, diagLabel:b.diagLabel || "" },
      note: i === 0 ? logNote : "",
      time, isoDate: todayIso, date:"Today"
    }));
    setLogs(prev => [...newLogs, ...prev]);
    setSelectedBehaviors([]); setLogNote(""); setShowLogForm(false);
  };

  // ── Appointment helpers ──
  const addAppointment = () => {
    if (!newAppt.title || !newAppt.time) return;
    const appt = { ...newAppt, id: Date.now(), done: false };
    setAppointments(prev => [...prev, appt]);
    if (pushEnabled) scheduleApptReminder(appt.title, appt.time, appt.period);
    setNewAppt({ title:"", therapist:"", time:"", period:"AM", color:"#5BA8D4", repeat:"weekly" });
    setShowApptForm(false);
  };
  const deleteAppointment = (id) => { setAppointments(prev => prev.filter(a => a.id !== id)); setConfirmDeleteAppt(null); };
  const updateAppointment = () => { if (!editAppt) return; setAppointments(prev => prev.map(a => a.id === editAppt.id ? {...editAppt} : a)); setEditAppt(null); };
  const toggleApptDone = (id) => setAppointments(prev => prev.map(a => a.id === id ? {...a, done:!a.done} : a));
  const sortedAppts = [...appointments].sort((a,b) => {
    const m = x => { const [h,mn]=(x.time||"0:0").split(":").map(Number); return (x.period==="PM"&&h!==12?h+12:h)*60+(mn||0); };
    return m(a)-m(b);
  });

  // ── Medication helpers ──
  const addMedication = () => {
    if (!newMed.name) return;
    const med = { ...newMed, id: Date.now() };
    setMedications(prev => [...prev, med]);
    if (pushEnabled) med.times.forEach(t => scheduleMedReminder(med.name, t, med.customTimes?.[t]));
    setNewMed({ name:"", dose:"", times:["Morning"], type:"regular", customTimes:{"Morning":"08:00","Afternoon":"13:00","Evening":"18:00","Bedtime":"21:00"} });
    setShowMedForm(false);
    setActiveTab("track"); setTrackSubTab("meds");
  };
  const deleteMedication = (id) => setMedications(prev => prev.filter(m => m.id !== id));
  const toggleMedLog = (medId, time) => {
    const key = `${medId}_${time}_${todayIso}`;
    setMedLogs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const isMedTaken = (medId, time) => medLogs.includes(`${medId}_${time}_${todayIso}`);
  const setMedEffect    = (medId, val) => setMedEffects(prev => ({...prev, [`${medId}_${todayIso}`]: val}));
  const setMedSideEffect = (medId, val) => setMedSideEffects(prev => ({...prev, [`${medId}_${todayIso}`]: val}));
  const getMedEffect    = (medId) => medEffects[`${medId}_${todayIso}`] || 0;
  const getMedSideEffect = (medId) => medSideEffects[`${medId}_${todayIso}`] || "";

  const getMedCompliance = (medId) => {
    const med = medications.find(m => m.id === medId); if (!med) return 0;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const daysPassed = now.getDate();
    const expected = daysPassed * med.times.length; if (expected === 0) return 0;
    // medLogs format: "medId_time_isoDate"
    let taken = 0;
    for (const k of medLogs) {
      if (!k.startsWith(String(medId)+"_")) continue;
      const lastUnderscore = k.lastIndexOf("_");
      if (lastUnderscore === -1) continue;
      const dateStr = k.slice(lastUnderscore+1);
      if (dateStr.startsWith(ym)) taken++;
    }
    return Math.round((taken/expected)*100);
  };

  const getMedCalendar = (medId) => {
    const med = medications.find(m => m.id === medId); if (!med) return {};
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const result = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const taken = med.times.filter(tm => medLogs.includes(`${medId}_${tm}_${iso}`)).length;
      result[d] = taken === med.times.length ? "full" : taken > 0 ? "partial" : "none";
    }
    return result;
  };

  // ── Nutrition helpers ──
  const addFoodLog = () => {
    if (!newFood.name) return;
    setNutritionLogs(prev => [{ ...newFood, id: Date.now(), isoDate: todayIso, time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) }, ...prev]);
    setNewFood({ name:"", reaction:"liked", texture:"", temp:"", behaviorNote:"", mealTime:"Breakfast" });
    setShowNutritionForm(false);
  };
  const deleteFoodLog = (id) => setNutritionLogs(prev => prev.filter(l => l.id !== id));

  // ── Progress computations ──
  const getLogIso = (log) => log.isoDate || (log.date==="Today"?todayIso:log.date==="Yesterday"?yesterdayIso:null);

  const todayLogs = logs.filter(l => getLogIso(l) === todayIso);
  const todayPositive = todayLogs.filter(isPositive).length;
  const todayChallenging = todayLogs.length - todayPositive;

  // Week dates Mon-Sun
  const getWeekDates = () => {
    const today = new Date(); const dow = today.getDay();
    const mon = new Date(today); mon.setDate(today.getDate() - (dow===0?6:dow-1));
    return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((label,i) => {
      const d = new Date(mon); d.setDate(mon.getDate()+i);
      return { label, iso: toIso(d) };
    });
  };
  const weekDates = getWeekDates();
  const weekData = weekDates.map(({label,iso}) => {
    const dl = logs.filter(l => getLogIso(l) === iso);
    const pos = dl.filter(isPositive).length;
    return { day:label, positive:pos, challenging:dl.length-pos };
  });
  const maxBar = Math.max(...weekData.map(d=>d.positive+d.challenging), 1);

  // Monthly weeks
  const now = new Date();
  const monthWeeks = ["Wk 1","Wk 2","Wk 3","Wk 4"].map((label,wi) => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1+wi*7);
    if (start.getMonth() !== now.getMonth()) return { label, score:0, challengingCount:0 };
    const end = new Date(now.getFullYear(), now.getMonth(), 7+wi*7);
    const startIso = toIso(start); const endIso = toIso(end);
    const wl = logs.filter(l => { const d=getLogIso(l); return d&&d>=startIso&&d<=endIso; });
    if (wl.length===0) return { label, score:0, challengingCount:0 };
    const pos = wl.filter(isPositive).length;
    return { label, score:Math.round((pos/wl.length)*100), challengingCount:wl.length-pos };
  });
  const enoughForMonthly = logs.length >= 4;

  const totalLogs = logs.length;
  const totalPositive = logs.filter(isPositive).length;
  const overallGrowth = totalLogs===0 ? 0 : Math.round((totalPositive/totalLogs)*100);

  // Streak
  const logIsoDates = new Set(logs.map(getLogIso).filter(Boolean));
  let streak = 0;
  const sc = new Date();
  while (streak < 365) {
    if (logIsoDates.has(toIso(sc))) { streak++; sc.setDate(sc.getDate()-1); } else break;
  }

  // Top 3 behaviors
  const bCount = {};
  logs.forEach(l => { const k = l.behavior?.label||"?"; bCount[k]=(bCount[k]||0)+1; });
  const top3 = Object.entries(bCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([label,count]) => {
    const log = logs.find(l=>l.behavior?.label===label);
    return { label, count, icon:log?.behavior?.icon||"📌", color:log?.behavior?.color||"#7BC4A0" };
  });

  // Diagnosis breakdown
  const allDiags = diagnosisCategories.flatMap(c=>c.diagnoses);
  const diagBreakdown = selectedDiagnoses.map(diagId => {
    const diagName = allDiags.find(d=>d.id===diagId)?.label || diagId;
    const dl = logs.filter(l => l.behavior?.diagLabel && behaviorsByDiagnosis[diagId]?.label && l.behavior.diagLabel.includes(behaviorsByDiagnosis[diagId]?.label?.split(" ")[0]));
    const pos = dl.filter(isPositive).length;
    return { diagId, diagName, pos, total:dl.length, pct:dl.length===0?0:Math.round((pos/dl.length)*100) };
  }).filter(d=>d.total>0);

  // Monthly summary
  const monthLabel = now.toLocaleString("en-US",{month:"long",year:"numeric"});
  const monthlySummary = logs.length===0 ? null : { month:monthLabel, total:totalLogs, positive:totalPositive, challenging:totalLogs-totalPositive, topBehavior:top3[0]||null };

  // Food stats — all food logs
  const foodStats = (() => {
    const fl = nutritionLogs;
    if (fl.length === 0) return null;
    const counts = { liked:0, disliked:0, new:0, allergy:0, neutral:0 };
    fl.forEach(l => { if (counts[l.reaction]!==undefined) counts[l.reaction]++; });
    const fc = {};
    fl.forEach(l => { fc[l.name]=(fc[l.name]||0)+1; });
    const top3foods = Object.entries(fc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,count])=>{
      const log = fl.find(l=>l.name===name);
      return { name, count, reaction:log?.reaction||"neutral" };
    });
    const newFoods     = fl.filter(l=>l.reaction==="new");
    const refusedFoods = fl.filter(l=>l.reaction==="disliked");
    const allergyFoods = fl.filter(l=>l.reaction==="allergy");

    // Behavior correlation
    // Requirements:
    // - Food must be eaten on 2+ different days (1 day = no comparison possible)
    // - Must have at least 1 non-food day with behavior logs to compare against
    // - Refused/allergy foods excluded (already flagged separately)
    // - riskScore must be meaningfully higher (> 1.0 challenging moment difference)
    const allLogDays = [...new Set(logs.map(getLogIso).filter(Boolean))];
    const foodNames = [...new Set(fl.map(l=>l.name))];
    const correlation = foodNames.map(name => {
      // Skip refused/allergy foods - already shown in their own sections
      const foodEntries = fl.filter(l=>l.name===name);
      if (foodEntries.some(l=>l.reaction==="disliked"||l.reaction==="allergy")) return null;
      const foodDays = [...new Set(foodEntries.map(l=>l.isoDate).filter(Boolean))];
      // Need at least 2 days of data for this food
      if (foodDays.length < 2) return null;
      const nonFoodDays = allLogDays.filter(d=>!foodDays.includes(d));
      // Need comparison days with behavior logs
      if (nonFoodDays.length < 1) return null;
      const chalOnFood = logs.filter(l=>{ const d=getLogIso(l); return d&&foodDays.includes(d)&&!isPositive(l); }).length;
      const chalOnNon  = logs.filter(l=>{ const d=getLogIso(l); return d&&nonFoodDays.includes(d)&&!isPositive(l); }).length;
      const avgFood = chalOnFood / foodDays.length;
      const avgNon  = chalOnNon  / Math.max(nonFoodDays.length,1);
      const riskScore = avgFood - avgNon;
      // Only show if meaningfully higher (at least 1 more challenging moment on food days)
      return riskScore > 1.0 ? { name, foodDays:foodDays.length, avgChal:avgFood.toFixed(1), avgNonChal:avgNon.toFixed(1), riskScore } : null;
    }).filter(Boolean).sort((a,b)=>b.riskScore-a.riskScore).slice(0,3);

    return { total:fl.length, counts, top3foods, newFoods, refusedFoods, allergyFoods, correlation };
  })();

  // ── Style helpers ──
  const t = theme; const f = font.style;
  const behaviorSections = getBehaviorSections(selectedDiagnoses);
  const diagnosisLabels = () => selectedDiagnoses.map(id => allDiags.find(d=>d.id===id)?.label).filter(Boolean).join(", ");

  const CSS = `
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    *{box-sizing:border-box;}
    input,textarea{font-family:${f};}
  `;
  const GFONTS = null; // Using system fonts for iOS compatibility

  // ── Sub-tab selector component ──
  const SubTabs = ({ tabs, active, onChange }) => (
    <div style={{ display:"flex", background:t.secondary, borderRadius:14, padding:4, marginBottom:16, gap:4 }}>
      {tabs.map(([id,label]) => (
        <div key={id} onClick={() => onChange(id)}
          style={{ flex:1, textAlign:"center", padding:"10px 0", borderRadius:10, background:active===id?t.card:"transparent", fontSize:12, fontWeight:700, color:active===id?t.primary:t.text, opacity:active===id?1:0.5, cursor:"pointer", boxShadow:active===id?`0 2px 8px ${t.soft}88`:"none", transition:"all 0.2s" }}>
          {label}
        </div>
      ))}
    </div>
  );

  // ── Field component — stable input, no re-render on each keystroke ──
  const Field = ({ label, value, onChange, placeholder, type="text" }) => (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>{label}</label>
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={e => { onChange(e.target.value); e.target.style.borderColor = t.soft; }}
        onFocus={e => e.target.style.borderColor = t.primary}
        onKeyDown={e => { if (e.key === "Enter") { onChange(e.target.value); e.target.blur(); } }}
        style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none" }}
      />
    </div>
  );

  // ── ONBOARDING ───────────────────────────────────────────
  // Loading screen while fetching from Supabase
  if (isLoading) return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg,${t.bg},${t.secondary})`, fontFamily:f, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      {GFONTS}<style>{CSS}</style>
      <div style={{ fontSize:60, animation:"fadeUp 0.5s ease" }}>🌱</div>
      <div style={{ fontSize:18, fontWeight:800, color:t.text }}>Loading Sprout...</div>
      <div style={{ fontSize:13, color:t.text, opacity:0.5 }}>Syncing your data</div>
      <div style={{ width:200, height:4, background:t.soft, borderRadius:4, overflow:"hidden", marginTop:8 }}>
        <div style={{ height:"100%", background:t.primary, borderRadius:4, width:"60%", animation:"slideRight 1.5s ease infinite" }}/>
      </div>
      <style>{`@keyframes slideRight { 0%{transform:translateX(-100%)} 100%{transform:translateX(250%)} }`}</style>
    </div>
  );

  if (step === 0) return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg,${t.bg},${t.secondary})`, fontFamily:f, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      {GFONTS}<style>{CSS}</style>
      <div style={{ textAlign:"center", maxWidth:360, animation:"fadeUp 0.6s ease" }}>
        <div style={{ fontSize:80, marginBottom:16 }}>🌱</div>
        <h1 style={{ fontSize:46, fontWeight:800, color:t.text, margin:"0 0 6px", letterSpacing:"-1px" }}>Sprout</h1>
        <p style={{ fontSize:13, color:t.accent, fontWeight:700, margin:"0 0 14px", letterSpacing:2, textTransform:"uppercase" }}>Your child's growth journal</p>
        <p style={{ fontSize:15, color:t.text, opacity:0.65, lineHeight:1.7, margin:"0 0 40px" }}>Track behaviors, celebrate progress, and watch your little one bloom — one day at a time.</p>
        <button onClick={()=>setStep("mode_select")} style={{ background:t.primary, color:"#fff", border:"none", borderRadius:16, padding:"16px 48px", fontSize:17, fontWeight:700, cursor:"pointer", fontFamily:f, width:"100%" }}>
          Let's Begin 🌿
        </button>
        <p style={{ fontSize:12, color:t.text, opacity:0.35, marginTop:14 }}>Free to start · No credit card needed</p>
      </div>
    </div>
  );

  if (step === "mode_select") return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg,${t.bg},${t.secondary})`, fontFamily:f, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      {GFONTS}<style>{CSS}</style>
      <div style={{ textAlign:"center", maxWidth:360, animation:"fadeUp 0.5s ease" }}>
        <div style={{ fontSize:52, marginBottom:12 }}>👶</div>
        <h2 style={{ fontSize:28, fontWeight:800, color:t.text, margin:"0 0 8px" }}>How would you like to track?</h2>
        <p style={{ fontSize:14, color:t.text, opacity:0.55, margin:"0 0 32px", lineHeight:1.6 }}>You can always change this later in Settings</p>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div onClick={()=>{ setTrackingMode("specific"); setStep(1); }}
            style={{ background:t.card, borderRadius:20, padding:22, cursor:"pointer", border:`2.5px solid ${trackingMode==="specific"?t.primary:t.soft}`, textAlign:"left", boxShadow:`0 4px 20px ${t.soft}66`, transition:"all 0.2s" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🌟</div>
            <div style={{ fontSize:17, fontWeight:800, color:t.text, marginBottom:5 }}>My child has specific needs</div>
            <div style={{ fontSize:13, color:t.text, opacity:0.55, lineHeight:1.6 }}>Detailed behavior tracking, therapy schedules, medication logs, and diagnosis-specific insights.</div>
          </div>
          <div onClick={()=>{ setTrackingMode("simple"); setStep(1); }}
            style={{ background:t.card, borderRadius:20, padding:22, cursor:"pointer", border:`2.5px solid ${trackingMode==="simple"?t.primary:t.soft}`, textAlign:"left", boxShadow:`0 4px 20px ${t.soft}66`, transition:"all 0.2s" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🌱</div>
            <div style={{ fontSize:17, fontWeight:800, color:t.text, marginBottom:5 }}>Simple tracking</div>
            <div style={{ fontSize:13, color:t.text, opacity:0.55, lineHeight:1.6 }}>Daily mood check-ins, praise journal, vitamins, schedule, and growth — simple and light.</div>
          </div>
        </div>
        <p style={{ fontSize:12, color:t.text, opacity:0.3, marginTop:20 }}>Every child is unique 💙</p>
      </div>
    </div>
  );

  const ProgressBar = ({ current, total }) => (
    <div style={{ display:"flex", gap:6, marginBottom:20 }}>
      {Array.from({length:total},(_,i)=>(
        <div key={i} style={{ flex:1, height:4, borderRadius:4, background:i<current?t.primary:t.soft }}/>
      ))}
    </div>
  );

  if (step === 1) {
    const handleStep1Continue = () => {
      const nameEl = document.getElementById("sprout-name-input");
      const ageEl  = document.getElementById("sprout-age-input");
      const name = nameEl?.value?.trim() || "";
      const age  = ageEl?.value?.trim()  || "";
      if (!name) { nameEl?.focus(); return; }
      setChildName(name);
      setChildAge(age);
      // Simple tracking skips diagnosis step
      setStep(trackingMode === "simple" ? 3 : 2);
    };
    return (
      <div style={{ minHeight:"100vh", background:t.bg, fontFamily:f, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
        {GFONTS}<style>{CSS}</style>
        <div style={{ width:"100%", maxWidth:380, animation:"fadeUp 0.5s ease" }}>
          <ProgressBar current={1} total={3}/>
          <h2 style={{ fontSize:26, fontWeight:800, color:t.text, margin:"0 0 6px" }}>About your child</h2>
          <p style={{ fontSize:13, color:t.text, opacity:0.55, margin:"0 0 22px" }}>We'll personalize everything for you</p>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Child's first name *</label>
            <input id="sprout-name-input" type="text" defaultValue={childName} placeholder="e.g. Noah"
              style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none" }}
              onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
          </div>
          <div style={{ marginBottom:22 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Age</label>
            <input id="sprout-age-input" type="number" defaultValue={childAge} placeholder="e.g. 7"
              style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none" }}
              onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
          </div>
          <button onClick={handleStep1Continue}
            style={{ width:"100%", background:t.primary, color:"#fff", border:"none", borderRadius:14, padding:16, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:f }}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) return (
    <div style={{ minHeight:"100vh", background:t.bg, fontFamily:f, padding:"24px 20px 40px" }}>
      {GFONTS}<style>{CSS}</style>
      <div style={{ maxWidth:400, margin:"0 auto", paddingTop:16, animation:"fadeUp 0.5s ease" }}>
        <ProgressBar current={2} total={3}/>
        <h2 style={{ fontSize:26, fontWeight:800, color:t.text, margin:"0 0 4px" }}>{childName ? `${childName}'s diagnosis` : "Diagnosis"}</h2>
        <p style={{ fontSize:13, color:t.text, opacity:0.55, margin:"0 0 16px" }}>Select all that apply · Update anytime in Profile</p>
        {selectedDiagnoses.length>0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
            {selectedDiagnoses.map(id=>{ const d=allDiags.find(x=>x.id===id); return d?(
              <div key={id} onClick={()=>setSelectedDiagnoses(prev=>prev.filter(x=>x!==id))}
                style={{ background:t.primary, color:"#fff", borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                {d.label} <span style={{ opacity:0.75 }}>×</span>
              </div>):null;
            })}
          </div>
        )}
        {diagnosisCategories.map(cat=>(
          <div key={cat.id} style={{ marginBottom:10 }}>
            <div onClick={()=>setOpenCat(openCat===cat.id?null:cat.id)}
              style={{ background:t.card, borderRadius:14, padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", border:`2px solid ${openCat===cat.id?t.primary:t.soft}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>{cat.icon}</span>
                <span style={{ fontSize:15, fontWeight:700, color:t.text }}>{cat.label}</span>
                {cat.diagnoses.some(d=>selectedDiagnoses.includes(d.id)) && (
                  <span style={{ background:t.primary, color:"#fff", borderRadius:10, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
                    {cat.diagnoses.filter(d=>selectedDiagnoses.includes(d.id)).length}
                  </span>
                )}
              </div>
              <span style={{ color:t.text, opacity:0.4, fontSize:16 }}>{openCat===cat.id?"▲":"▼"}</span>
            </div>
            {openCat===cat.id && (
              <div style={{ background:t.secondary, borderRadius:"0 0 14px 14px", padding:"4px 8px 10px", border:`2px solid ${t.primary}`, borderTop:"none", animation:"slideDown 0.2s ease" }}>
                {cat.diagnoses.map(d=>(
                  <div key={d.id} onClick={()=>setSelectedDiagnoses(prev=>prev.includes(d.id)?prev.filter(x=>x!==d.id):[...prev,d.id])}
                    style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 10px", borderRadius:10, cursor:"pointer", background:selectedDiagnoses.includes(d.id)?t.primary+"18":"transparent" }}>
                    <span style={{ fontSize:14, color:t.text, fontWeight:selectedDiagnoses.includes(d.id)?700:400 }}>{d.label}</span>
                    <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${selectedDiagnoses.includes(d.id)?t.primary:t.soft}`, background:selectedDiagnoses.includes(d.id)?t.primary:"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {selectedDiagnoses.includes(d.id) && <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>✓</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div onClick={()=>setStep(3)} style={{ background:"transparent", border:`2px dashed ${t.soft}`, borderRadius:14, padding:"12px 16px", cursor:"pointer", textAlign:"center", margin:"8px 0 16px" }}>
          <span style={{ fontSize:13, color:t.text, opacity:0.45 }}>Prefer not to say / Not listed</span>
        </div>
        <button onClick={()=>setStep(3)} style={{ width:"100%", background:t.primary, color:"#fff", border:"none", borderRadius:14, padding:16, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:f }}>
          {selectedDiagnoses.length>0?`Continue (${selectedDiagnoses.length} selected) →`:"Skip →"}
        </button>
      </div>
    </div>
  );

  if (step === 3) return (
    <div style={{ minHeight:"100vh", background:t.bg, fontFamily:f, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      {GFONTS}<style>{CSS}</style>
      <div style={{ width:"100%", maxWidth:380, animation:"fadeUp 0.5s ease" }}>
        <ProgressBar current={3} total={3}/>
        <h2 style={{ fontSize:26, fontWeight:800, color:t.text, margin:"0 0 6px" }}>Choose your theme</h2>
        <p style={{ fontSize:13, color:t.text, opacity:0.55, margin:"0 0 22px" }}>You can change this anytime</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:24 }}>
          {themes.map(th=>(
            <div key={th.id} onClick={()=>setTheme(th)} style={{ background:th.secondary, borderRadius:18, padding:18, cursor:"pointer", border:`3px solid ${theme.id===th.id?th.primary:"transparent"}`, transform:theme.id===th.id?"scale(1.04)":"scale(1)", transition:"all 0.2s" }}>
              <div style={{ fontSize:28, marginBottom:10 }}>{th.emoji}</div>
              <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                {[th.primary,th.soft,th.accent].map((c,i)=><div key={i} style={{ width:18, height:18, borderRadius:"50%", background:c }}/>)}
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:th.text }}>{th.name}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>setStep(5)} style={{ width:"100%", background:t.primary, color:"#fff", border:"none", borderRadius:14, padding:16, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:f }}>Let's go! 🌱</button>
      </div>
    </div>
  );



  // ══════════════════════════════════════════════════════
  // ── MAIN APP ──────────────────────────────────────────
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:"100vh", background:t.bg, fontFamily:f, maxWidth:430, margin:"0 auto", paddingBottom:84 }}>
      {GFONTS}<style>{CSS}</style>

      {/* ── PAYWALL MODAL ── */}
      {showPaywall && !isSubscribed && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:t.card, borderRadius:24, padding:28, width:"100%", maxWidth:360, textAlign:"center" }}>
            <div style={{ fontSize:52, marginBottom:10 }}>🌱</div>
            <div style={{ fontSize:20, fontWeight:800, color:t.text, marginBottom:6 }}>Your free trial has ended</div>
            <div style={{ fontSize:13, color:t.text, opacity:0.6, marginBottom:22, lineHeight:1.6 }}>Subscribe to keep tracking your child's progress and never lose your data.</div>
            <div style={{ background:`linear-gradient(135deg,${t.primary},${t.accent})`, borderRadius:16, padding:18, marginBottom:18, color:"#fff" }}>
              <div style={{ fontSize:28, fontWeight:900 }}>$3.99<span style={{ fontSize:14, fontWeight:500 }}>/month</span></div>
              <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>Unlimited tracking · Cloud sync · Reminders</div>
            </div>
            <button
              onClick={async () => {
                // Load Stripe
                const script = document.createElement("script");
                script.src = "https://js.stripe.com/v3/";
                document.head.appendChild(script);
                script.onload = () => {
                  const stripe = window.Stripe(STRIPE_KEY);
                  stripe.redirectToCheckout({
                    lineItems: [{ price: "price_sprout_monthly", quantity: 1 }],
                    mode: "subscription",
                    successUrl: window.location.origin + "?subscribed=true",
                    cancelUrl: window.location.origin,
                  }).catch(() => {
                    // Fallback: mark as subscribed for demo
                    const newSub = { status:"active", activatedAt: Date.now() };
                    setSubStatus(newSub);
                    localStorage.setItem("sprout_sub", JSON.stringify(newSub));
                    setShowPaywall(false);
                  });
                };
              }}
              style={{ width:"100%", background:t.primary, color:"#fff", border:"none", borderRadius:14, padding:16, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:f, marginBottom:10 }}>
              Subscribe Now 🌿
            </button>
            <button onClick={()=>setShowPaywall(false)} style={{ background:"none", border:"none", color:t.text, opacity:0.4, fontSize:13, cursor:"pointer", fontFamily:f }}>Maybe later</button>
          </div>
        </div>
      )}

      {/* ── TRIAL BANNER ── */}
      {!isSubscribed && subStatus.status === "trial" && trialDaysLeft > 0 && (
        <div style={{ background:`linear-gradient(90deg,${t.primary},${t.accent})`, color:"#fff", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:12, fontWeight:700 }}>🌱 {trialDaysLeft} day{trialDaysLeft!==1?"s":""} left in free trial</span>
          <span onClick={()=>setShowPaywall(true)} style={{ fontSize:11, fontWeight:800, background:"rgba(255,255,255,0.25)", borderRadius:8, padding:"4px 10px", cursor:"pointer" }}>Subscribe</span>
        </div>
      )}

      {/* ── MULTI-CHILD HEADER ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px 0" }}>
        <div onClick={()=>setShowChildPicker(true)} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", background:t.card, borderRadius:14, padding:"8px 14px", boxShadow:`0 2px 8px ${t.soft}44` }}>
          <span style={{ fontSize:20 }}>👶</span>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:t.text }}>{childName||"My Child"}</div>
            <div style={{ fontSize:10, color:t.text, opacity:0.45 }}>{trackingMode==="simple"?"Simple tracking":"Specific needs"} · Tap to switch</div>
          </div>
          <span style={{ fontSize:12, color:t.text, opacity:0.3 }}>▼</span>
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:t.accent, background:`${t.primary}18`, borderRadius:10, padding:"6px 12px" }}>
          {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}
        </div>
      </div>

      {/* ── CHILD PICKER MODAL ── */}
      {showChildPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:250, display:"flex", alignItems:"flex-end", justifyContent:"center", animation:"fadeIn 0.2s" }}>
          <div style={{ background:t.card, borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:430, maxHeight:"70vh", overflowY:"auto" }}>
            <div style={{ fontSize:16, fontWeight:800, color:t.text, marginBottom:16 }}>Switch Child 👶</div>
            {/* Current child */}
            <div style={{ background:`${t.primary}12`, borderRadius:14, padding:"14px 16px", marginBottom:10, border:`2px solid ${t.primary}` }}>
              <div style={{ fontSize:14, fontWeight:800, color:t.text }}>{childName||"My Child"} <span style={{ fontSize:11, color:t.primary }}>(current)</span></div>
              <div style={{ fontSize:11, color:t.text, opacity:0.5 }}>Age {childAge||"—"} · {trackingMode==="simple"?"Simple":"Specific needs"}</div>
            </div>
            {/* Other children */}
            {children.map(child=>(
              <div key={child.id} onClick={()=>{
                // Save current child
                const currentChild = { id: activeChildId||"main", name:childName, age:childAge, mode:trackingMode, logs, medications, medLogs, nutritionLogs, appointments };
                setChildren(prev=>[...prev.filter(c=>c.id!==currentChild.id), currentChild]);
                // Load selected child
                setChildName(child.name); setChildAge(child.age); setTrackingMode(child.mode||"specific");
                setLogs(child.logs||[]); setMedications(child.medications||[]); setMedLogs(child.medLogs||[]);
                setNutritionLogs(child.nutritionLogs||[]); setAppointments(child.appointments||[]);
                setActiveChildId(child.id); setShowChildPicker(false);
              }} style={{ background:t.secondary, borderRadius:14, padding:"14px 16px", marginBottom:10, cursor:"pointer" }}>
                <div style={{ fontSize:14, fontWeight:700, color:t.text }}>{child.name}</div>
                <div style={{ fontSize:11, color:t.text, opacity:0.5 }}>Age {child.age||"—"} · {child.mode==="simple"?"Simple":"Specific needs"}</div>
              </div>
            ))}
            {/* Add new child */}
            {showAddChild ? (
              <div style={{ background:t.secondary, borderRadius:14, padding:16, marginBottom:10 }}>
                <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:12 }}>New Child</div>
                <input value={newChildName} onChange={e=>setNewChildName(e.target.value)} placeholder="Child's name"
                  style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:`2px solid ${t.soft}`, background:t.card, fontSize:14, color:t.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:f }}/>
                <input value={newChildAge} onChange={e=>setNewChildAge(e.target.value)} placeholder="Age" type="number"
                  style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:`2px solid ${t.soft}`, background:t.card, fontSize:14, color:t.text, outline:"none", marginBottom:12, boxSizing:"border-box", fontFamily:f }}/>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  {[["specific","🌟 Specific needs"],["simple","🌱 Simple"]].map(([val,lbl])=>(
                    <div key={val} onClick={()=>setNewChildMode(val)} style={{ flex:1, padding:"10px 6px", borderRadius:10, background:newChildMode===val?t.primary:t.card, color:newChildMode===val?"#fff":t.text, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"center", border:`2px solid ${newChildMode===val?t.primary:t.soft}` }}>{lbl}</div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>{
                    if(!newChildName.trim())return;
                    setChildren(prev=>[...prev,{id:Date.now(),name:newChildName.trim(),age:newChildAge,mode:newChildMode,logs:[],medications:[],medLogs:[],nutritionLogs:[],appointments:[]}]);
                    setNewChildName(""); setNewChildAge(""); setNewChildMode("specific"); setShowAddChild(false);
                  }} style={{ flex:1, background:t.primary, color:"#fff", border:"none", borderRadius:10, padding:12, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:f }}>Add ✓</button>
                  <button onClick={()=>setShowAddChild(false)} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:10, padding:"12px 16px", fontSize:13, cursor:"pointer", fontFamily:f }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div onClick={()=>setShowAddChild(true)} style={{ background:`${t.primary}14`, borderRadius:14, padding:14, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center", marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:700, color:t.accent }}>+ Add Another Child</span>
              </div>
            )}
            <button onClick={()=>setShowChildPicker(false)} style={{ width:"100%", background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Close</button>
          </div>
        </div>
      )}

      {/* ── PUSH NOTIFICATION PROMPT ── */}
      {!pushEnabled && step === 5 && (
        <div style={{ background:`linear-gradient(90deg,${t.primary}22,${t.accent}22)`, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${t.soft}` }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:t.text, marginBottom:2 }}>🔔 Enable Reminders</div>
            <div style={{ fontSize:11, color:t.text, opacity:0.6 }}>Get notified for vitamins & appointments</div>
          </div>
          <div onClick={enablePush} style={{ fontSize:12, fontWeight:800, color:"#fff", cursor:"pointer", background:t.primary, borderRadius:10, padding:"8px 14px", whiteSpace:"nowrap" }}>Turn On</div>
        </div>
      )}

      {/* ── MODALS ── */}
      {confirmDeleteLog !== null && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:24, animation:"fadeIn 0.2s" }}>
          <div style={{ background:t.card, borderRadius:20, padding:24, width:"100%", maxWidth:320, textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🗑️</div>
            <div style={{ fontSize:16, fontWeight:800, color:t.text, marginBottom:8 }}>Delete this log?</div>
            <div style={{ fontSize:13, color:t.text, opacity:0.55, marginBottom:22 }}>This can't be undone.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setConfirmDeleteLog(null)} style={{ flex:1, background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Cancel</button>
              <button onClick={()=>{ setLogs(prev=>prev.filter(l=>l.id!==confirmDeleteLog)); setConfirmDeleteLog(null); }} style={{ flex:1, background:"#FF6B6B", color:"#fff", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteAppt !== null && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:24, animation:"fadeIn 0.2s" }}>
          <div style={{ background:t.card, borderRadius:20, padding:24, width:"100%", maxWidth:320, textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🗑️</div>
            <div style={{ fontSize:16, fontWeight:800, color:t.text, marginBottom:8 }}>Delete appointment?</div>
            <div style={{ fontSize:13, color:t.text, opacity:0.55, marginBottom:22 }}>This can't be undone.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setConfirmDeleteAppt(null)} style={{ flex:1, background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Cancel</button>
              <button onClick={()=>deleteAppointment(confirmDeleteAppt)} style={{ flex:1, background:"#FF6B6B", color:"#fff", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {editAppt !== null && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", animation:"fadeIn 0.2s" }}>
          <div style={{ background:t.card, borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:430, maxHeight:"85vh", overflowY:"auto" }}>
            <div style={{ fontSize:16, fontWeight:800, color:t.text, marginBottom:18 }}>Edit Appointment ✏️</div>
            <Field label="Title *" value={editAppt.title||""} onChange={v=>setEditAppt(p=>({...p,title:v}))} placeholder="e.g. Speech Therapy"/>
            <Field label="Therapist" value={editAppt.therapist||""} onChange={v=>setEditAppt(p=>({...p,therapist:v}))} placeholder="e.g. Ms. Jennifer"/>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Time *</label>
              <div style={{ display:"flex", gap:8 }}>
                <input type="time" value={editAppt.time||""} onChange={e=>setEditAppt(p=>({...p,time:e.target.value}))}
                  style={{ flex:1, padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none" }}
                  onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
                {["AM","PM"].map(p=><div key={p} onClick={()=>setEditAppt(prev=>({...prev,period:p}))} style={{ padding:"12px 16px", borderRadius:12, background:editAppt.period===p?t.primary:t.secondary, color:editAppt.period===p?"#fff":t.text, fontSize:14, fontWeight:700, cursor:"pointer" }}>{p}</div>)}
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Repeat</label>
              <div style={{ display:"flex", gap:8 }}>
                {[["once","One time"],["weekly","Weekly"],["daily","Daily"]].map(([val,lbl])=><div key={val} onClick={()=>setEditAppt(p=>({...p,repeat:val}))} style={{ flex:1, padding:"10px 6px", borderRadius:12, background:editAppt.repeat===val?t.primary:t.secondary, color:editAppt.repeat===val?"#fff":t.text, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"center" }}>{lbl}</div>)}
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>Color</label>
              <div style={{ display:"flex", gap:10 }}>{apptColors.map(c=><div key={c} onClick={()=>setEditAppt(p=>({...p,color:c}))} style={{ width:30, height:30, borderRadius:"50%", background:c, cursor:"pointer", border:`3px solid ${editAppt.color===c?t.text:"transparent"}` }}/>)}</div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={updateAppointment} style={{ flex:1, background:t.primary, color:"#fff", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Save ✓</button>
              <button onClick={()=>setEditAppt(null)} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"14px 16px", fontSize:14, cursor:"pointer", fontFamily:f }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ background:t.card, padding:"18px 20px 14px", borderBottom:`1px solid ${t.soft}`, position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:22 }}>🌱</span>
              <span style={{ fontSize:20, fontWeight:800, color:t.text }}>Sprout</span>
            </div>
            <p style={{ fontSize:12, color:t.text, opacity:0.45, margin:"2px 0 0" }}>{childName?`${childName}'s journal`:"Your child's journal"}</p>
          </div>
          <div style={{ background:t.secondary, borderRadius:10, padding:"6px 12px", fontSize:12, fontWeight:700, color:t.accent }}>
            {new Date().toLocaleString("en-US",{month:"short",year:"numeric"})}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          HOME TAB
      ══════════════════════════════════════════ */}
      {activeTab === "home" && trackingMode === "simple" && (
        <div style={{ padding:"18px 16px", animation:"fadeUp 0.35s ease" }}>
          {/* SIMPLE HOME */}
          <div style={{ background:`linear-gradient(135deg,${t.primary},${t.accent})`, borderRadius:20, padding:18, marginBottom:16, color:"#fff" }}>
            <div style={{ fontSize:11, fontWeight:700, opacity:0.8, marginBottom:6, letterSpacing:1.5, textTransform:"uppercase" }}>
              Today · {new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
            </div>
            <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Hi! How is {childName||"your child"} today? 🌱</div>
            <div style={{ fontSize:13, opacity:0.8 }}>Tap a mood to log it</div>
          </div>

          {/* Mood quick log */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:14 }}>😊 How's the mood?</div>
            <div style={{ display:"flex", justifyContent:"space-around" }}>
              {[["😄","Great","#7BC4A0"],["🙂","Good","#B8DDD0"],["😐","Okay","#FFD166"],["😤","Rough","#F4A56A"],["😢","Hard","#FF6B6B"]].map(([emoji,label,color])=>{
                const todayMoods = moodLogs.filter(m=>m.isoDate===todayIso);
                const isSel = todayMoods.some(m=>m.emoji===emoji && m.time==="now");
                return (
                  <div key={emoji} onClick={()=>{
                    const now = new Date();
                    setMoodLogs(prev=>[{ id:Date.now(), emoji, label, color, isoDate:todayIso, time:now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}), period:"now" }, ...prev.filter(m=>!(m.isoDate===todayIso&&m.period==="now"))]);
                  }}
                    style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, cursor:"pointer" }}>
                    <div style={{ fontSize:36, filter:isSel?"none":"grayscale(0.3)", transform:isSel?"scale(1.2)":"scale(1)", transition:"all 0.2s" }}>{emoji}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:isSel?color:t.text, opacity:isSel?1:0.5 }}>{label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Praise log */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:10 }}>⭐ Today's Win</div>
            {praiseLogs.filter(p=>p.isoDate===todayIso).length > 0 ? (
              praiseLogs.filter(p=>p.isoDate===todayIso).map((p,i)=>(
                <div key={p.id} style={{ background:`${t.primary}12`, borderRadius:12, padding:"10px 14px", marginBottom:6, fontSize:13, color:t.text, fontWeight:600 }}>
                  ⭐ {p.text}
                </div>
              ))
            ) : (
              <div style={{ fontSize:13, color:t.text, opacity:0.4, marginBottom:10 }}>No wins logged yet today</div>
            )}
            {showPraiseForm ? (
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <input value={newPraise} onChange={e=>setNewPraise(e.target.value)} placeholder="What did they do well today?"
                  style={{ flex:1, padding:"10px 12px", borderRadius:10, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:13, color:t.text, outline:"none", fontFamily:f }}
                  onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
                <button onClick={()=>{ if(!newPraise.trim())return; setPraiseLogs(prev=>[{id:Date.now(),text:newPraise.trim(),isoDate:todayIso},...prev]); setNewPraise(""); setShowPraiseForm(false); }}
                  style={{ background:t.primary, color:"#fff", border:"none", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:f }}>Save</button>
              </div>
            ) : (
              <div onClick={()=>setShowPraiseForm(true)} style={{ background:`${t.primary}14`, borderRadius:12, padding:"10px 14px", border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center" }}>
                <span style={{ fontSize:13, fontWeight:700, color:t.accent }}>+ Add a win ⭐</span>
              </div>
            )}
          </div>

          {/* Weekly mood chart */}
          {moodLogs.length > 0 && (
            <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
              <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:12 }}>📊 This Week's Mood</div>
              <div style={{ display:"flex", gap:8 }}>
                {weekDates.map(({label,iso})=>{
                  const dayMood = moodLogs.find(m=>m.isoDate===iso);
                  return (
                    <div key={iso} style={{ flex:1, textAlign:"center" }}>
                      <div style={{ fontSize:22, marginBottom:4 }}>{dayMood?.emoji||"·"}</div>
                      <div style={{ fontSize:9, color:t.text, opacity:0.45, fontWeight:600 }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Growth quick view */}
          {growthLogs.length > 0 && (
            <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
              <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:10 }}>📏 Latest Growth</div>
              <div style={{ display:"flex", gap:12 }}>
                {growthLogs[0].height && <div style={{ flex:1, textAlign:"center", background:t.secondary, borderRadius:12, padding:"12px 4px" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:t.primary }}>{growthLogs[0].height}"</div>
                  <div style={{ fontSize:10, color:t.text, opacity:0.5 }}>Height</div>
                </div>}
                {growthLogs[0].weight && <div style={{ flex:1, textAlign:"center", background:t.secondary, borderRadius:12, padding:"12px 4px" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:t.accent }}>{growthLogs[0].weight} lbs</div>
                  <div style={{ fontSize:10, color:t.text, opacity:0.5 }}>Weight</div>
                </div>}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "home" && trackingMode === "specific" && (
        <div style={{ padding:"18px 16px", animation:"fadeUp 0.35s ease" }}>

          {/* Today banner */}
          <div style={{ background:`linear-gradient(135deg,${t.primary},${t.accent})`, borderRadius:20, padding:18, marginBottom:16, color:"#fff" }}>
            <div style={{ fontSize:11, fontWeight:700, opacity:0.8, marginBottom:8, letterSpacing:1.5, textTransform:"uppercase" }}>
              Today · {new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
            </div>
            {todayLogs.length===0 ? (
              <div style={{ fontSize:14, opacity:0.85 }}>No logs yet today 🌱 Tap a behavior below!</div>
            ) : (
              <div style={{ display:"flex", gap:8 }}>
                {[[todayLogs.length,"Total","rgba(255,255,255,0.2)"],[todayPositive,"Positive ✨","rgba(255,255,255,0.15)"],[todayChallenging,"Challenging 💪","rgba(255,255,255,0.1)"]].map(([val,lbl,bg],i)=>(
                  <div key={i} style={{ flex:1, background:bg, borderRadius:10, padding:"10px 4px", textAlign:"center" }}>
                    <div style={{ fontSize:22, fontWeight:800 }}>{val}</div>
                    <div style={{ fontSize:9, opacity:0.85, marginTop:1 }}>{lbl}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick shortcuts */}
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {[
              { icon:"💊", label:"Meds", sub: medications.length===0 ? "Set up in Profile" : medications.every(m=>m.times.every(tm=>isMedTaken(m.id,tm))) ? "All done ✓" : "Tap to check", color: medications.length>0&&medications.every(m=>m.times.every(tm=>isMedTaken(m.id,tm))) ? "#7BC4A0" : t.accent, tab:"track", subTab:"meds" },
              { icon:"🥗", label:"Food", sub: nutritionLogs.filter(l=>l.isoDate===todayIso).length > 0 ? `${nutritionLogs.filter(l=>l.isoDate===todayIso).length} logged` : "Tap to log", color:t.accent, tab:"track", subTab:"food" },
              { icon:"📅", label:"Schedule", sub: `${appointments.filter(a=>!a.done).length} upcoming`, color:t.accent, tab:"track", subTab:"schedule" },
            ].map(item=>(
              <div key={item.label} onClick={()=>{ setActiveTab(item.tab); setTrackSubTab(item.subTab); }}
                style={{ flex:1, background:t.card, borderRadius:14, padding:"12px 8px", cursor:"pointer", textAlign:"center", boxShadow:`0 2px 8px ${t.soft}44` }}>
                <div style={{ fontSize:20 }}>{item.icon}</div>
                <div style={{ fontSize:11, fontWeight:800, color:t.text, marginTop:4 }}>{item.label}</div>
                <div style={{ fontSize:9, color:item.color, fontWeight:700, marginTop:2 }}>{item.sub}</div>
              </div>
            ))}
          </div>

          {/* Diagnosis tags */}
          {selectedDiagnoses.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
              {selectedDiagnoses.map(id=>{ const d=allDiags.find(x=>x.id===id); return d?<div key={id} style={{ background:t.secondary, borderRadius:20, padding:"4px 12px", fontSize:11, fontWeight:700, color:t.accent }}>{d.label}</div>:null; })}
            </div>
          )}

          {/* Quick Log — MULTI-SELECT */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:16, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:15, fontWeight:800, color:t.text }}>Quick Log ✏️</div>
              {selectedBehaviors.length > 0 && (
                <div style={{ background:t.primary, color:"#fff", borderRadius:10, padding:"4px 12px", fontSize:12, fontWeight:700 }}>
                  {selectedBehaviors.length} selected
                </div>
              )}
            </div>

            {behaviorSections.map((section, si) => (
              <div key={section.diagId} style={{ marginBottom:si<behaviorSections.length-1?18:0 }}>
                {behaviorSections.length > 1 && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:section.color }}/>
                    <span style={{ fontSize:10, fontWeight:800, color:t.text, opacity:0.6, textTransform:"uppercase", letterSpacing:1.2 }}>{section.label}</span>
                    <div style={{ flex:1, height:1, background:t.soft }}/>
                  </div>
                )}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {section.behaviors.map(b => {
                    const sel = isBehaviorSelected(b, section.label);
                    return (
                      <div key={b.id} onClick={()=>toggleBehavior(b, section.label)}
                        style={{ background:sel?b.color+"22":t.secondary, border:`2px solid ${sel?b.color:"transparent"}`, borderRadius:14, padding:"12px 8px", textAlign:"center", cursor:"pointer", transition:"all 0.15s" }}>
                        <div style={{ fontSize:24, marginBottom:5 }}>{b.icon}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:t.text, lineHeight:1.3 }}>{b.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Note + Save — shows when any behavior selected */}
            {selectedBehaviors.length > 0 && (
              <div style={{ marginTop:16, animation:"slideDown 0.25s ease" }}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                  {selectedBehaviors.map(b=>(
                    <div key={b._key} style={{ display:"flex", alignItems:"center", gap:5, background:b.color+"22", border:`1.5px solid ${b.color}`, borderRadius:10, padding:"4px 10px" }}>
                      <span style={{ fontSize:14 }}>{b.icon}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:t.text }}>{b.label}</span>
                      <span onClick={()=>setSelectedBehaviors(prev=>prev.filter(x=>x._key!==b._key))} style={{ fontSize:12, color:t.text, opacity:0.5, cursor:"pointer", marginLeft:2 }}>×</span>
                    </div>
                  ))}
                </div>
                <textarea value={logNote} onChange={e=>setLogNote(e.target.value)} placeholder="Add a note... (optional)"
                  style={{ width:"100%", padding:12, borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:13, color:t.text, resize:"none", height:68, outline:"none" }}
                  onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button onClick={saveLog} style={{ flex:1, background:t.primary, color:"#fff", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>
                    Save {selectedBehaviors.length} log{selectedBehaviors.length>1?"s":""} ✓
                  </button>
                  <button onClick={()=>{ setSelectedBehaviors([]); setLogNote(""); }} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"13px 14px", fontSize:13, cursor:"pointer", fontFamily:f }}>Clear</button>
                </div>
              </div>
            )}
          </div>

          {/* Recent Logs — grouped by date */}
          <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Recent Logs 📋</div>
            {logs.length===0 && <div style={{ textAlign:"center", padding:"20px 0", color:t.text, opacity:0.35, fontSize:13 }}>No logs yet 🌱</div>}
            {(() => {
              const grouped = {};
              logs.slice(0,20).forEach(log => {
                const key = getDisplayDate(log);
                if (!grouped[key]) grouped[key]=[];
                grouped[key].push(log);
              });
              const order = ["Today","Yesterday",...Object.keys(grouped).filter(d=>d!=="Today"&&d!=="Yesterday")];
              return order.filter(d=>grouped[d]).map(date=>(
                <div key={date} style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:11, fontWeight:800, color:t.accent, textTransform:"uppercase", letterSpacing:1.2 }}>{date}</span>
                    <span style={{ background:t.primary, color:"#fff", borderRadius:10, padding:"1px 8px", fontSize:11, fontWeight:700 }}>{grouped[date].length}</span>
                    <div style={{ flex:1, height:1, background:t.soft }}/>
                  </div>
                  {grouped[date].map((log,i)=>(
                    <div key={log.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 0", borderBottom:i<grouped[date].length-1?`1px solid ${t.secondary}`:"none" }}>
                      <div style={{ background:log.behavior.color+"22", borderRadius:10, padding:"7px", fontSize:18, flexShrink:0 }}>{log.behavior.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:t.text }}>{log.behavior.label}</div>
                        {log.behavior.diagLabel && behaviorSections.length>1 && <div style={{ fontSize:10, color:t.accent, fontWeight:600, marginTop:1, opacity:0.7 }}>{log.behavior.diagLabel}</div>}
                        {log.note && <div style={{ fontSize:11, color:t.text, opacity:0.55, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{log.note}</div>}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, flexShrink:0 }}>
                        <div style={{ fontSize:10, color:t.text, opacity:0.35 }}>{log.time}</div>
                        <button onClick={()=>setConfirmDeleteLog(log.id)} style={{ background:"#FF6B6B18", border:"none", borderRadius:8, padding:"3px 8px", fontSize:11, color:"#FF6B6B", cursor:"pointer", fontFamily:f }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          TRACK TAB
      ══════════════════════════════════════════ */}
      {activeTab === "track" && trackingMode === "simple" && (
        <div style={{ padding:"18px 16px", animation:"fadeUp 0.35s ease" }}>
          <SubTabs tabs={[["meds","💊 Vitamins"],["schedule","📅 Schedule"],["growth","📏 Growth"]]} active={trackSubTab} onChange={setTrackSubTab}/>

          {/* SIMPLE - VITAMINS (reuse meds) */}
          {trackSubTab === "meds" && (
            <div>
              {medications.length === 0 && (
                <div style={{ textAlign:"center", padding:"30px 0", color:t.text, opacity:0.4, fontSize:14 }}>No vitamins added yet 💊</div>
              )}
              {medications.map(med=>(
                <div key={med.id} style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:10 }}>{med.name} {med.dose && `· ${med.dose}`}</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {med.times.map(time=>(
                      <div key={time} onClick={()=>toggleMedLog(med.id,time)}
                        style={{ padding:"8px 16px", borderRadius:10, background:isMedTaken(med.id,time)?t.primary:t.secondary, color:isMedTaken(med.id,time)?"#fff":t.text, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                        {isMedTaken(med.id,time)?"✓ ":""}{time}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {showMedForm ? (
                <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Add Vitamin/Supplement ➕</div>
                  <Field label="Name *" value={newMed.name} onChange={v=>setNewMed(p=>({...p,name:v}))} placeholder="e.g. Vitamin D3"/>
                  <Field label="Dose" value={newMed.dose} onChange={v=>setNewMed(p=>({...p,dose:v}))} placeholder="e.g. 1000 IU"/>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Reminder Times</label>
                    {medTimes.map(tm=>(
                      <div key={tm} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: newMed.times.includes(tm)?8:0 }}>
                          <div onClick={()=>setNewMed(p=>({...p,times:p.times.includes(tm)?p.times.filter(x=>x!==tm):[...p.times,tm]}))}
                            style={{ width:22, height:22, borderRadius:6, border:`2px solid ${newMed.times.includes(tm)?t.primary:t.soft}`, background:newMed.times.includes(tm)?t.primary:"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                            {newMed.times.includes(tm) && <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>✓</span>}
                          </div>
                          <span style={{ fontSize:14, fontWeight:700, color:newMed.times.includes(tm)?t.text:t.text, opacity:newMed.times.includes(tm)?1:0.45 }}>{tm}</span>
                          {newMed.times.includes(tm) && (
                            <input type="time" value={newMed.customTimes?.[tm]||"08:00"}
                              onChange={e=>setNewMed(p=>({...p,customTimes:{...p.customTimes,[tm]:e.target.value}}))}
                              style={{ marginLeft:"auto", padding:"6px 10px", borderRadius:10, border:`2px solid ${t.primary}`, background:t.secondary, fontSize:14, color:t.text, outline:"none", fontFamily:f }}/>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={addMedication} style={{ flex:1, background:t.primary, color:"#fff", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Save ✓</button>
                    <button onClick={()=>setShowMedForm(false)} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"14px 16px", fontSize:14, cursor:"pointer", fontFamily:f }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>setShowMedForm(true)} style={{ background:`${t.primary}14`, borderRadius:16, padding:16, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:t.accent }}>+ Add Vitamin / Supplement</span>
                </div>
              )}
            </div>
          )}

          {/* SIMPLE - SCHEDULE (reuse existing) */}
          {trackSubTab === "schedule" && (
            <div>
              {sortedAppts.map((appt,i)=>(
                <div key={appt.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", background:t.card, borderRadius:16, marginBottom:10, boxShadow:`0 2px 8px ${t.soft}44` }}>
                  <div style={{ width:4, height:40, borderRadius:4, background:appt.color, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:t.text }}>{appt.title}</div>
                    <div style={{ fontSize:12, color:t.accent, fontWeight:600 }}>{appt.time} {appt.period} · {appt.repeat==="weekly"?"Weekly":appt.repeat==="daily"?"Daily":"One time"}</div>
                  </div>
                  <button onClick={()=>setConfirmDeleteAppt(appt.id)} style={{ background:"#FF6B6B18", border:"none", borderRadius:8, padding:"6px 10px", fontSize:12, color:"#FF6B6B", cursor:"pointer" }}>✕</button>
                </div>
              ))}
              {showApptForm ? (
                <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>New Schedule ➕</div>
                  <Field label="Title *" value={newAppt.title} onChange={v=>setNewAppt(p=>({...p,title:v}))} placeholder="e.g. Soccer Practice"/>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Time *</label>
                    <div style={{ display:"flex", gap:8 }}>
                      <input type="time" value={newAppt.time} onChange={e=>{
                        const val=e.target.value; const hour=parseInt(val.split(":")[0],10);
                        const autoPeriod=hour>=12?"PM":"AM"; const displayHour=hour===0?12:hour>12?hour-12:hour;
                        const mins=val.split(":")[1]||"00";
                        setNewAppt(p=>({...p,time:`${String(displayHour).padStart(2,"0")}:${mins}`,period:autoPeriod}));
                      }} style={{ flex:1, padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none" }}/>
                      {["AM","PM"].map(p=><div key={p} onClick={()=>setNewAppt(prev=>({...prev,period:p}))} style={{ padding:"12px 16px", borderRadius:12, background:newAppt.period===p?t.primary:t.secondary, color:newAppt.period===p?"#fff":t.text, fontSize:14, fontWeight:700, cursor:"pointer" }}>{p}</div>)}
                    </div>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Repeat</label>
                    <div style={{ display:"flex", gap:8 }}>
                      {[["once","One time"],["weekly","Weekly"],["daily","Daily"]].map(([val,lbl])=><div key={val} onClick={()=>setNewAppt(p=>({...p,repeat:val}))} style={{ flex:1, padding:"10px 6px", borderRadius:12, background:newAppt.repeat===val?t.primary:t.secondary, color:newAppt.repeat===val?"#fff":t.text, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"center" }}>{lbl}</div>)}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={addAppointment} style={{ flex:1, background:t.primary, color:"#fff", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Save ✓</button>
                    <button onClick={()=>setShowApptForm(false)} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"14px 16px", fontSize:14, cursor:"pointer", fontFamily:f }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>setShowApptForm(true)} style={{ background:`${t.primary}14`, borderRadius:16, padding:16, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:t.accent }}>+ Add Schedule</span>
                </div>
              )}
            </div>
          )}

          {/* SIMPLE - GROWTH */}
          {trackSubTab === "growth" && (
            <div>
              {growthLogs.map((g,i)=>(
                <div key={g.id} style={{ background:t.card, borderRadius:16, padding:"14px 16px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center", boxShadow:`0 2px 8px ${t.soft}44` }}>
                  <div>
                    <div style={{ fontSize:12, color:t.text, opacity:0.45, marginBottom:3 }}>{g.isoDate}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:t.text }}>
                      {g.height && `📏 ${g.height}"`} {g.weight && `⚖️ ${g.weight} lbs`}
                    </div>
                  </div>
                  <button onClick={()=>setGrowthLogs(prev=>prev.filter(x=>x.id!==g.id))} style={{ background:"#FF6B6B18", border:"none", borderRadius:8, padding:"6px 10px", fontSize:12, color:"#FF6B6B", cursor:"pointer" }}>✕</button>
                </div>
              ))}
              {showGrowthForm ? (
                <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Add Measurement 📏</div>
                  <Field label="Height (inches)" value={newHeight} onChange={setNewHeight} placeholder='e.g. 48"'/>
                  <Field label="Weight (lbs)" value={newWeight} onChange={setNewWeight} placeholder="e.g. 52"/>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>{ if(!newHeight&&!newWeight)return; setGrowthLogs(prev=>[{id:Date.now(),height:newHeight,weight:newWeight,isoDate:todayIso},...prev]); setNewHeight(""); setNewWeight(""); setShowGrowthForm(false); }}
                      style={{ flex:1, background:t.primary, color:"#fff", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>Save ✓</button>
                    <button onClick={()=>setShowGrowthForm(false)} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"14px 16px", fontSize:14, cursor:"pointer", fontFamily:f }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>setShowGrowthForm(true)} style={{ background:`${t.primary}14`, borderRadius:16, padding:16, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:t.accent }}>+ Add Measurement</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "track" && trackingMode === "specific" && (
        <div style={{ padding:"18px 16px", animation:"fadeUp 0.35s ease" }}>
          <SubTabs tabs={[["meds","💊 Meds"],["food","🥗 Food"],["schedule","📅 Schedule"]]} active={trackSubTab} onChange={setTrackSubTab}/>

          {/* MEDS */}
          {trackSubTab === "meds" && (
            <div>
              {/* Daily check for each medication */}
              {medications.map(med=>(
                <div key={med.id} style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:800, color:t.text }}>{med.name}</div>
                      <div style={{ fontSize:12, color:t.text, opacity:0.5 }}>{med.dose} · {med.type==="regular"?"Daily":"As needed (PRN)"}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ background:med.times.every(tm=>isMedTaken(med.id,tm))?"#7BC4A022":t.secondary, borderRadius:10, padding:"6px 12px" }}>
                        <span style={{ fontSize:13, fontWeight:800, color:med.times.every(tm=>isMedTaken(med.id,tm))?"#4A9B7A":t.accent }}>
                          {med.times.filter(tm=>isMedTaken(med.id,tm)).length}/{med.times.length} today
                        </span>
                      </div>
                      <button onClick={()=>deleteMedication(med.id)} style={{ background:"#FF6B6B18", border:"none", borderRadius:8, padding:"6px 10px", fontSize:12, color:"#FF6B6B", cursor:"pointer", fontFamily:f }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
                    {med.times.map(tm=>(
                      <div key={tm} onClick={()=>toggleMedLog(med.id,tm)}
                        style={{ display:"flex", alignItems:"center", gap:6, background:isMedTaken(med.id,tm)?"#7BC4A022":t.secondary, border:`2px solid ${isMedTaken(med.id,tm)?"#7BC4A0":"transparent"}`, borderRadius:10, padding:"8px 14px", cursor:"pointer", transition:"all 0.15s" }}>
                        <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${isMedTaken(med.id,tm)?"#7BC4A0":t.soft}`, background:isMedTaken(med.id,tm)?"#7BC4A0":"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          {isMedTaken(med.id,tm)&&<span style={{ color:"#fff", fontSize:11, fontWeight:800 }}>✓</span>}
                        </div>
                        <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{tm}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:t.text, opacity:0.55, marginBottom:7, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>How effective today?</div>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      {[1,2,3,4,5].map(n=>(
                        <div key={n} onClick={()=>setMedEffect(med.id,n)}
                          style={{ width:34, height:34, borderRadius:8, background:getMedEffect(med.id)>=n?t.primary:t.secondary, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"all 0.15s" }}>
                          <span style={{ color:getMedEffect(med.id)>=n?"#fff":t.text, opacity:getMedEffect(med.id)>=n?1:0.3, fontSize:16 }}>★</span>
                        </div>
                      ))}
                      {getMedEffect(med.id)>0&&<span style={{ fontSize:12, color:t.accent, fontWeight:800, marginLeft:4 }}>{getMedEffect(med.id)}/5</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>Side effects / symptoms today</div>
                    <input type="text" value={getMedSideEffect(med.id)} onChange={e=>setMedSideEffect(med.id,e.target.value)}
                      placeholder="e.g. Less appetite, more calm, headache..."
                      style={{ width:"100%", padding:"10px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:13, color:t.text, outline:"none", fontFamily:f }}
                      onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
                  </div>
                </div>
              ))}

              {/* Add new medication — right here in Track */}
              {showMedForm ? (
                <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66`, animation:"slideDown 0.25s" }}>
                  <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Add Medication 💊</div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Medication name *</label>
                    <input type="text" value={newMed.name} onChange={e=>setNewMed(p=>({...p,name:e.target.value}))} placeholder="e.g. Ritalin, Melatonin"
                      style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none", fontFamily:f }}
                      onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Dose</label>
                    <input type="text" value={newMed.dose} onChange={e=>setNewMed(p=>({...p,dose:e.target.value}))} placeholder="e.g. 10mg"
                      style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none", fontFamily:f }}
                      onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Reminder Times</label>
                    {medTimes.map(tm=>(
                      <div key={tm} style={{ marginBottom:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div onClick={()=>setNewMed(p=>({...p,times:p.times.includes(tm)?p.times.filter(x=>x!==tm):[...p.times,tm]}))}
                            style={{ width:22, height:22, borderRadius:6, border:`2px solid ${newMed.times.includes(tm)?t.primary:t.soft}`, background:newMed.times.includes(tm)?t.primary:"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                            {newMed.times.includes(tm) && <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>✓</span>}
                          </div>
                          <span style={{ fontSize:14, fontWeight:700, color:t.text, opacity:newMed.times.includes(tm)?1:0.45 }}>{tm}</span>
                          {newMed.times.includes(tm) && (
                            <input type="time" value={newMed.customTimes?.[tm]||"08:00"}
                              onChange={e=>setNewMed(p=>({...p,customTimes:{...p.customTimes,[tm]:e.target.value}}))}
                              style={{ marginLeft:"auto", padding:"6px 10px", borderRadius:10, border:`2px solid ${t.primary}`, background:t.secondary, fontSize:14, color:t.text, outline:"none", fontFamily:f }}/>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Type</label>
                    <div style={{ display:"flex", gap:8 }}>
                      {[["regular","Daily (regular)"],["prn","As needed (PRN)"]].map(([val,lbl])=>(
                        <div key={val} onClick={()=>setNewMed(p=>({...p,type:val}))}
                          style={{ flex:1, padding:"9px 8px", borderRadius:10, background:newMed.type===val?t.primary:t.secondary, color:newMed.type===val?"#fff":t.text, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"center" }}>{lbl}</div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={addMedication} disabled={!newMed.name}
                      style={{ flex:1, background:newMed.name?t.primary:t.soft, color:"#fff", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:newMed.name?"pointer":"not-allowed", fontFamily:f }}>Save ✓</button>
                    <button onClick={()=>setShowMedForm(false)}
                      style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"13px 14px", fontSize:13, cursor:"pointer", fontFamily:f }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>setShowMedForm(true)}
                  style={{ background:`${t.primary}14`, borderRadius:16, padding:16, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:t.accent }}>+ Add Medication</span>
                </div>
              )}
            </div>
          )}

          {/* FOOD */}
          {trackSubTab === "food" && (
            <div>
              <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:4 }}>Today's Food Log 🥗</div>
                <div style={{ fontSize:12, color:t.text, opacity:0.5, marginBottom:14 }}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
                {nutritionLogs.filter(l=>l.isoDate===todayIso).length===0 ? (
                  <div style={{ textAlign:"center", padding:"16px 0", color:t.text, opacity:0.35, fontSize:13 }}>Nothing logged today 🍽️</div>
                ) : nutritionLogs.filter(l=>l.isoDate===todayIso).map((log,i,arr)=>{
                  const rx = foodReactions.find(r=>r.id===log.reaction);
                  return (
                    <div key={log.id} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:i<arr.length-1?`1px solid ${t.secondary}`:"none" }}>
                      <div style={{ background:(rx?.color||t.primary)+"22", borderRadius:10, padding:"8px", fontSize:20, flexShrink:0 }}>
                        {log.reaction==="liked"?"😊":log.reaction==="disliked"?"😤":log.reaction==="new"?"🆕":log.reaction==="allergy"?"⚠️":"😐"}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:t.text }}>{log.name}</div>
                        <div style={{ fontSize:11, color:rx?.color||t.accent, fontWeight:600, marginTop:1 }}>{rx?.label} · {log.mealTime}</div>
                        {log.texture&&<div style={{ fontSize:11, color:t.text, opacity:0.5, marginTop:1 }}>Texture: {log.texture}</div>}
                        {log.behaviorNote&&<div style={{ fontSize:11, color:t.text, opacity:0.55, marginTop:1 }}>📝 {log.behaviorNote}</div>}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                        <div style={{ fontSize:10, color:t.text, opacity:0.35 }}>{log.time}</div>
                        <button onClick={()=>deleteFoodLog(log.id)} style={{ background:"#FF6B6B18", border:"none", borderRadius:8, padding:"3px 8px", fontSize:11, color:"#FF6B6B", cursor:"pointer", fontFamily:f }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {showNutritionForm ? (
                <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66`, animation:"slideDown 0.25s" }}>
                  <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Add Food 🍽️</div>
                  <Field label="Food name *" value={newFood.name} onChange={v=>setNewFood(p=>({...p,name:v}))} placeholder="e.g. Chicken nuggets, Apple slices"/>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Meal time</label>
                    <div style={{ display:"flex", gap:8 }}>
                      {mealTimes.map(mt=><div key={mt} onClick={()=>setNewFood(p=>({...p,mealTime:mt}))} style={{ flex:1, padding:"8px 4px", borderRadius:10, background:newFood.mealTime===mt?t.primary:t.secondary, color:newFood.mealTime===mt?"#fff":t.text, fontSize:11, fontWeight:700, cursor:"pointer", textAlign:"center" }}>{mt}</div>)}
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Reaction</label>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {foodReactions.map(r=><div key={r.id} onClick={()=>setNewFood(p=>({...p,reaction:r.id}))} style={{ padding:"7px 12px", borderRadius:10, background:newFood.reaction===r.id?r.color+"33":t.secondary, border:`2px solid ${newFood.reaction===r.id?r.color:"transparent"}`, fontSize:12, fontWeight:700, color:t.text, cursor:"pointer" }}>{r.label}</div>)}
                    </div>
                  </div>
                  <Field label="Texture / Temperature" value={newFood.texture} onChange={v=>setNewFood(p=>({...p,texture:v}))} placeholder="e.g. Refused crunchy, liked warm"/>
                  <Field label="Behavior after eating" value={newFood.behaviorNote} onChange={v=>setNewFood(p=>({...p,behaviorNote:v}))} placeholder="e.g. More calm, had meltdown after"/>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={addFoodLog} disabled={!newFood.name} style={{ flex:1, background:newFood.name?t.primary:t.soft, color:"#fff", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, cursor:newFood.name?"pointer":"not-allowed", fontFamily:f }}>Save ✓</button>
                    <button onClick={()=>setShowNutritionForm(false)} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"13px 14px", fontSize:13, cursor:"pointer", fontFamily:f }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>setShowNutritionForm(true)} style={{ background:`${t.primary}14`, borderRadius:16, padding:16, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:t.accent }}>+ Add Food Log</span>
                </div>
              )}
            </div>
          )}

          {/* SCHEDULE */}
          {trackSubTab === "schedule" && (
            <div>
              <SubTabs tabs={[["list","📋 List"],["month","📅 Month"]]} active={scheduleView} onChange={setScheduleView}/>
              {scheduleView === "list" && (
                <>
                  <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                    {[[appointments.length,"Total","#7BC4A0"],[appointments.filter(a=>a.done).length,"Done",t.primary],[appointments.filter(a=>!a.done).length,"Upcoming","#F4A56A"]].map(([val,lbl,color],i)=>(
                      <div key={i} style={{ flex:1, background:t.card, borderRadius:12, padding:"10px 4px", textAlign:"center", boxShadow:`0 2px 6px ${t.soft}44` }}>
                        <div style={{ fontSize:20, fontWeight:800, color }}>{val}</div>
                        <div style={{ fontSize:10, color:t.text, opacity:0.5 }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                    <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Today's Schedule</div>
                    {sortedAppts.length===0&&<div style={{ textAlign:"center", padding:"18px 0", color:t.text, opacity:0.35, fontSize:13 }}>No appointments yet 📅</div>}
                    {sortedAppts.map((appt,i)=>(
                      <div key={appt.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 0", borderBottom:i<sortedAppts.length-1?`1px solid ${t.secondary}`:"none", opacity:appt.done?0.5:1 }}>
                        <div onClick={()=>toggleApptDone(appt.id)} style={{ width:22, height:22, borderRadius:7, border:`2px solid ${appt.done?appt.color:t.soft}`, background:appt.done?appt.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                          {appt.done&&<span style={{ color:"#fff", fontSize:12, fontWeight:800 }}>✓</span>}
                        </div>
                        <div style={{ width:4, height:36, borderRadius:4, background:appt.color, flexShrink:0 }}/>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:t.text, textDecoration:appt.done?"line-through":"none" }}>{appt.title}</div>
                          {appt.therapist&&<div style={{ fontSize:11, color:t.text, opacity:0.45, marginTop:1 }}>{appt.therapist}</div>}
                          <div style={{ fontSize:10, color:t.accent, marginTop:2, fontWeight:600 }}>{appt.time} {appt.period} · {appt.repeat==="weekly"?"Every week":appt.repeat==="daily"?"Every day":"One time"}</div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          <button onClick={()=>setEditAppt({...appt})} style={{ background:`${t.primary}18`, border:"none", borderRadius:7, padding:"4px 8px", fontSize:11, color:t.primary, cursor:"pointer", fontFamily:f }}>✏️</button>
                          <button onClick={()=>setConfirmDeleteAppt(appt.id)} style={{ background:"#FF6B6B18", border:"none", borderRadius:7, padding:"4px 8px", fontSize:11, color:"#FF6B6B", cursor:"pointer", fontFamily:f }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {showApptForm ? (
                    <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66`, animation:"slideDown 0.25s" }}>
                      <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>New Appointment ➕</div>
                      <Field label="Title *" value={newAppt.title} onChange={v=>setNewAppt(p=>({...p,title:v}))} placeholder="e.g. Speech Therapy"/>
                      <Field label="Therapist" value={newAppt.therapist} onChange={v=>setNewAppt(p=>({...p,therapist:v}))} placeholder="e.g. Ms. Jennifer"/>
                      <div style={{ marginBottom:14 }}>
                        <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Time *</label>
                        <div style={{ display:"flex", gap:8 }}>
                          <input type="time" value={newAppt.time} onChange={e=>{
                            const val=e.target.value;
                            const hour=parseInt(val.split(":")[0],10);
                            const autoPeriod = hour>=12?"PM":"AM";
                            const displayHour = hour===0?12:hour>12?hour-12:hour;
                            const mins = val.split(":")[1]||"00";
                            const displayTime = `${String(displayHour).padStart(2,"0")}:${mins}`;
                            setNewAppt(p=>({...p,time:displayTime,period:autoPeriod}));
                          }}
                            style={{ flex:1, padding:"12px 14px", borderRadius:12, border:`2px solid ${t.soft}`, background:t.secondary, fontSize:14, color:t.text, outline:"none" }}
                            onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=t.soft}/>
                          {["AM","PM"].map(p=><div key={p} onClick={()=>setNewAppt(prev=>({...prev,period:p}))} style={{ padding:"12px 16px", borderRadius:12, background:newAppt.period===p?t.primary:t.secondary, color:newAppt.period===p?"#fff":t.text, fontSize:14, fontWeight:700, cursor:"pointer" }}>{p}</div>)}
                        </div>
                      </div>
                      <div style={{ marginBottom:14 }}>
                        <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Repeat</label>
                        <div style={{ display:"flex", gap:8 }}>
                          {[["once","One time"],["weekly","Weekly"],["daily","Daily"]].map(([val,lbl])=><div key={val} onClick={()=>setNewAppt(p=>({...p,repeat:val}))} style={{ flex:1, padding:"10px 6px", borderRadius:12, background:newAppt.repeat===val?t.primary:t.secondary, color:newAppt.repeat===val?"#fff":t.text, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"center" }}>{lbl}</div>)}
                        </div>
                      </div>
                      <div style={{ marginBottom:20 }}>
                        <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.text, opacity:0.55, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>Color</label>
                        <div style={{ display:"flex", gap:10 }}>{apptColors.map(c=><div key={c} onClick={()=>setNewAppt(p=>({...p,color:c}))} style={{ width:30, height:30, borderRadius:"50%", background:c, cursor:"pointer", border:`3px solid ${newAppt.color===c?t.text:"transparent"}` }}/>)}</div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={addAppointment} disabled={!newAppt.title||!newAppt.time} style={{ flex:1, background:newAppt.title&&newAppt.time?t.primary:t.soft, color:"#fff", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:700, cursor:newAppt.title&&newAppt.time?"pointer":"not-allowed", fontFamily:f }}>Save ✓</button>
                        <button onClick={()=>{ setShowApptForm(false); setNewAppt({title:"",therapist:"",time:"",period:"AM",color:"#5BA8D4",repeat:"weekly"}); }} style={{ background:t.secondary, color:t.text, border:"none", borderRadius:12, padding:"14px 16px", fontSize:14, cursor:"pointer", fontFamily:f }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={()=>setShowApptForm(true)} style={{ background:`${t.primary}14`, borderRadius:16, padding:16, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center" }}>
                      <span style={{ fontSize:14, fontWeight:700, color:t.accent }}>+ Add Appointment</span>
                    </div>
                  )}
                </>
              )}
              {scheduleView === "month" && (() => {
                const yr=calMonth.getFullYear(), mo=calMonth.getMonth();
                const mName=calMonth.toLocaleString("default",{month:"long"});
                const firstDay=new Date(yr,mo,1).getDay(), days=new Date(yr,mo+1,0).getDate();
                const tod=new Date();
                const cells=[...Array(firstDay).fill(null),...Array.from({length:days},(_,i)=>i+1)];
                return (
                  <div>
                    <div style={{ background:t.card, borderRadius:20, padding:16, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                        <div onClick={()=>setCalMonth(new Date(yr,mo-1,1))} style={{ width:36, height:36, borderRadius:10, background:t.secondary, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:18 }}>‹</div>
                        <div style={{ fontSize:16, fontWeight:800, color:t.text }}>{mName} {yr}</div>
                        <div onClick={()=>setCalMonth(new Date(yr,mo+1,1))} style={{ width:36, height:36, borderRadius:10, background:t.secondary, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:18 }}>›</div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6 }}>
                        {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{ textAlign:"center", fontSize:11, fontWeight:800, color:t.text, opacity:0.4, padding:"4px 0" }}>{d}</div>)}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
                        {cells.map((day,i)=>{
                          if(!day) return <div key={i}/>;
                          const isSel=selectedCalDate===day, isToday=tod.getFullYear()===yr&&tod.getMonth()===mo&&tod.getDate()===day;
                          return (
                            <div key={i} onClick={()=>setSelectedCalDate(isSel?null:day)} style={{ borderRadius:10, padding:"6px 2px", textAlign:"center", cursor:"pointer", background:isSel?t.primary:isToday?t.secondary:"transparent", border:isToday&&!isSel?`2px solid ${t.primary}`:"2px solid transparent" }}>
                              <div style={{ fontSize:13, fontWeight:isToday?800:500, color:isSel?"#fff":isToday?t.primary:t.text }}>{day}</div>
                              {(() => {
                                // Show dots only for appointments that actually occur on this day
                                const cellDate = new Date(yr, mo, day);
                                const cellDow = cellDate.getDay(); // 0=Sun
                                const todayDate = new Date();
                                const apptsDots = appointments.filter(a => {
                                  if (a.repeat === "daily") return true;
                                  if (a.repeat === "weekly") {
                                    // Check if day of week matches appointment time
                                    // Use today as reference for weekly appointments
                                    const refDow = todayDate.getDay();
                                    return cellDow === refDow;
                                  }
                                  // "once" — only show on today's date
                                  return yr === todayDate.getFullYear() && mo === todayDate.getMonth() && day === todayDate.getDate();
                                });
                                return apptsDots.length > 0 ? (
                                  <div style={{ display:"flex", justifyContent:"center", gap:2, marginTop:2 }}>
                                    {apptsDots.slice(0,3).map((a,ai)=><div key={ai} style={{ width:4, height:4, borderRadius:"50%", background:isSel?"rgba(255,255,255,0.8)":a.color }}/>)}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {selectedCalDate && (
                      <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66`, animation:"slideDown 0.2s" }}>
                        <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>{mName} {selectedCalDate}</div>
                        {sortedAppts.map((appt,i)=>(
                          <div key={appt.id} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:i<sortedAppts.length-1?`1px solid ${t.secondary}`:"none" }}>
                            <div style={{ width:4, height:36, borderRadius:4, background:appt.color }}/>
                            <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700, color:t.text }}>{appt.title}</div>{appt.therapist&&<div style={{ fontSize:11, color:t.text, opacity:0.45 }}>{appt.therapist}</div>}</div>
                            <div style={{ fontSize:12, fontWeight:700, color:t.accent }}>{appt.time} {appt.period}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div onClick={()=>{ setScheduleView("list"); setShowApptForm(true); }} style={{ background:`${t.primary}14`, borderRadius:16, padding:14, border:`1.5px dashed ${t.primary}`, cursor:"pointer", textAlign:"center", marginTop:14 }}>
                      <span style={{ fontSize:14, fontWeight:700, color:t.accent }}>+ Add Appointment</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          PROGRESS TAB
      ══════════════════════════════════════════ */}
      {activeTab === "progress" && (
        <div style={{ padding:"18px 16px", animation:"fadeUp 0.35s ease" }}>
          <SubTabs tabs={[["behavior","📊 Behavior"],["meds","💊 Meds"],["food","🥗 Food"]]} active={progressSubTab} onChange={setProgressSubTab}/>

          {/* ── BEHAVIOR SUB-TAB ── */}
          {progressSubTab === "behavior" && (
            <div>
              {/* Stats strip */}
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {[[totalLogs,"Total",t.primary],[totalPositive,"Positive","#7BC4A0"],[overallGrowth+"%","Overall","#FFD166"],[streak+"d","Streak 🔥","#F4A56A"]].map(([val,lbl,color],i)=>(
                  <div key={i} style={{ flex:1, background:t.card, borderRadius:12, padding:"10px 4px", textAlign:"center", boxShadow:`0 2px 8px ${t.soft}44` }}>
                    <div style={{ fontSize:18, fontWeight:800, color }}>{val}</div>
                    <div style={{ fontSize:9, color:t.text, opacity:0.5 }}>{lbl}</div>
                  </div>
                ))}
              </div>

              {/* Today overview */}
              <div style={{ background:`linear-gradient(135deg,${t.primary},${t.accent})`, borderRadius:18, padding:16, marginBottom:14, color:"#fff" }}>
                <div style={{ fontSize:11, fontWeight:700, opacity:0.8, marginBottom:8, letterSpacing:1.5, textTransform:"uppercase" }}>Today · {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
                {todayLogs.length===0 ? <div style={{ fontSize:13, opacity:0.8 }}>No logs today yet 🌱</div> : (
                  <div style={{ display:"flex", gap:8 }}>
                    {[[todayLogs.length,"Total","rgba(255,255,255,0.2)"],[todayPositive,"Positive ✨","rgba(255,255,255,0.15)"],[todayChallenging,"Challenging 💪","rgba(255,255,255,0.1)"]].map(([val,lbl,bg],i)=>(
                      <div key={i} style={{ flex:1, background:bg, borderRadius:10, padding:"9px 4px", textAlign:"center" }}>
                        <div style={{ fontSize:20, fontWeight:800 }}>{val}</div>
                        <div style={{ fontSize:9, opacity:0.85, marginTop:1 }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* This Week */}
              <div style={{ background:t.card, borderRadius:18, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:10 }}>This Week 📊</div>
                <div style={{ display:"flex", gap:12, marginBottom:12 }}>
                  {[[t.primary,"Positive"],["#FF6B6B","Challenging"]].map(([c,l],i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:8, height:8, borderRadius:2, background:c }}/>
                      <span style={{ fontSize:11, color:t.text, opacity:0.55 }}>{l}</span>
                    </div>
                  ))}
                </div>
                {weekData.every(d=>d.positive===0&&d.challenging===0) ? (
                  <div style={{ textAlign:"center", padding:"12px 0", color:t.text, opacity:0.35, fontSize:13 }}>No logs this week yet 🌱</div>
                ) : (
                  <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:90 }}>
                    {weekData.map((d,i)=>(
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                        <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:2, alignItems:"center" }}>
                          <div style={{ width:"80%", borderRadius:4, background:"#FF6B6B", height:`${(d.challenging/maxBar)*65}px` }}/>
                          <div style={{ width:"80%", borderRadius:4, background:t.primary, height:`${Math.max((d.positive/maxBar)*65, d.positive>0?4:0)}px` }}/>
                        </div>
                        <div style={{ fontSize:9, color:t.text, opacity:d.positive>0||d.challenging>0?0.9:0.3, marginTop:2, fontWeight:d.positive>0||d.challenging>0?800:400 }}>{d.day}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Challenging Trend */}
              <div style={{ background:t.card, borderRadius:18, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:2 }}>Challenging Trend 💪</div>
                <div style={{ fontSize:11, color:t.text, opacity:0.45, marginBottom:14 }}>Going down = progress</div>
                {!enoughForMonthly ? (
                  <div style={{ textAlign:"center", padding:"12px 0" }}>
                    <div style={{ fontSize:13, color:t.text, opacity:0.5 }}>Log {Math.max(0,4-totalLogs)} more to unlock</div>
                    <div style={{ marginTop:10, height:5, background:t.secondary, borderRadius:4, overflow:"hidden" }}>
                      <div style={{ height:"100%", background:t.primary, borderRadius:4, width:`${Math.min((totalLogs/4)*100,100)}%`, transition:"width 0.5s" }}/>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:12, height:80 }}>
                      {monthWeeks.map((d,i)=>{
                        const maxC=Math.max(...monthWeeks.map(x=>x.challengingCount),1);
                        const isDown=i>0&&d.challengingCount<monthWeeks[i-1].challengingCount;
                        const bc=d.challengingCount===0?"#7BC4A0":isDown?"#F4A56A":"#FF6B6B";
                        return (
                          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:bc }}>{d.challengingCount>0?d.challengingCount:"✓"}</div>
                            <div style={{ width:"100%", borderRadius:"6px 6px 0 0", background:d.challengingCount>0?bc:"#7BC4A020", border:d.challengingCount===0?`2px solid #7BC4A0`:"none", height:`${Math.max((d.challengingCount/maxC)*60,5)}px`, transition:"height 0.5s" }}/>
                            <div style={{ fontSize:10, color:t.text, opacity:0.45 }}>{d.label}</div>
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      const filled=monthWeeks.filter(d=>d.challengingCount>0);
                      if(filled.length<2) return null;
                      const diff=filled[0].challengingCount-filled[filled.length-1].challengingCount;
                      return diff>0?<div style={{ marginTop:10, background:"#7BC4A018", borderRadius:10, padding:"7px 12px", fontSize:12, color:"#4A9B7A", fontWeight:700 }}>🎉 {diff} fewer challenging moments this month!</div>:null;
                    })()}
                  </>
                )}
              </div>

              {/* Monthly Growth */}
              <div style={{ background:t.card, borderRadius:18, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:2 }}>Monthly Growth 📈</div>
                <div style={{ fontSize:11, color:t.text, opacity:0.45, marginBottom:14 }}>Positive behavior % per week</div>
                {!enoughForMonthly ? (
                  <div style={{ textAlign:"center", padding:"12px 0" }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>🌱</div>
                    <div style={{ fontSize:13, color:t.text, opacity:0.5 }}>Log {Math.max(0,4-totalLogs)} more to unlock</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", alignItems:"flex-end", gap:12, height:100 }}>
                    {monthWeeks.map((d,i)=>(
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:t.accent }}>{d.score>0?d.score+"%":""}</div>
                        <div style={{ width:"100%", borderRadius:"8px 8px 0 0", background:d.score>0?(i===monthWeeks.length-1?t.primary:t.soft):t.secondary, height:`${Math.max((d.score/100)*85,d.score>0?6:0)}px`, transition:"height 0.5s" }}/>
                        <div style={{ fontSize:10, color:t.text, opacity:0.45 }}>{d.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Monthly Summary */}
              {monthlySummary && (
                <div style={{ background:t.card, borderRadius:18, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:12 }}>Monthly Summary 🗓️</div>
                  <div style={{ background:t.secondary, borderRadius:12, padding:14, marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:t.accent, marginBottom:8 }}>{monthlySummary.month}</div>
                    <div style={{ display:"flex", gap:16 }}>
                      {[["📋",monthlySummary.total,"Total"],["✨",monthlySummary.positive,"Positive"],["💪",monthlySummary.challenging,"Challenging"]].map(([icon,val,lbl],i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:14 }}>{icon}</span>
                          <div><div style={{ fontSize:16, fontWeight:800, color:t.text }}>{val}</div><div style={{ fontSize:10, color:t.text, opacity:0.5 }}>{lbl}</div></div>
                        </div>
                      ))}
                    </div>
                    {monthlySummary.topBehavior && (
                      <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8, background:t.card, borderRadius:8, padding:"7px 10px" }}>
                        <span style={{ fontSize:16 }}>{monthlySummary.topBehavior.icon}</span>
                        <div><div style={{ fontSize:10, color:t.text, opacity:0.5 }}>Most logged</div><div style={{ fontSize:12, fontWeight:700, color:t.text }}>{monthlySummary.topBehavior.label} · {monthlySummary.topBehavior.count}x</div></div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Wins */}
              <div style={{ background:t.card, borderRadius:18, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
                <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:12 }}>Recent Wins 🏆</div>
                {logs.filter(isPositive).slice(0,5).length===0 ? (
                  <div style={{ textAlign:"center", padding:"12px 0", color:t.text, opacity:0.35, fontSize:13 }}>No wins yet — keep going! 🌱</div>
                ) : logs.filter(isPositive).slice(0,5).map((log,i,arr)=>(
                  <div key={log.id} style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:i<arr.length-1?`1px solid ${t.secondary}`:"none" }}>
                    <div style={{ background:log.behavior.color+"22", borderRadius:8, padding:"6px 8px", fontSize:18, flexShrink:0 }}>{log.behavior.icon}</div>
                    <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700, color:t.text }}>{log.behavior.label}</div>{log.note&&<div style={{ fontSize:11, color:t.text, opacity:0.55, marginTop:1 }}>{log.note}</div>}</div>
                    <div style={{ fontSize:10, color:t.text, opacity:0.35, flexShrink:0, textAlign:"right" }}>{getDisplayDate(log)}<br/>{log.time}</div>
                  </div>
                ))}
              </div>

              {/* Most Logged + By Diagnosis */}
              <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                {top3.length>0&&(
                  <div style={{ flex:2, background:t.card, borderRadius:16, padding:16, boxShadow:`0 2px 8px ${t.soft}44` }}>
                    <div style={{ fontSize:13, fontWeight:800, color:t.text, marginBottom:10 }}>Most Logged</div>
                    {top3.map((b,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:i<top3.length-1?8:0 }}>
                        <span style={{ fontSize:16 }}>{b.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:t.text }}>{b.label}</div>
                          <div style={{ height:4, background:t.secondary, borderRadius:3, marginTop:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", background:b.color, borderRadius:3, width:`${Math.min((b.count/top3[0].count)*100,100)}%` }}/>
                          </div>
                        </div>
                        <div style={{ fontSize:12, fontWeight:800, color:b.color }}>{b.count}x</div>
                      </div>
                    ))}
                  </div>
                )}
                {diagBreakdown.length>0&&(
                  <div style={{ flex:1, background:t.card, borderRadius:16, padding:16, boxShadow:`0 2px 8px ${t.soft}44` }}>
                    <div style={{ fontSize:13, fontWeight:800, color:t.text, marginBottom:10 }}>By Diagnosis</div>
                    {diagBreakdown.map((d,i)=>(
                      <div key={i} style={{ marginBottom:i<diagBreakdown.length-1?10:0 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:10, color:t.text, opacity:0.7, fontWeight:600 }}>{d.diagName.split(" ")[0]}</span>
                          <span style={{ fontSize:10, fontWeight:800, color:t.primary }}>{d.pct}%</span>
                        </div>
                        <div style={{ height:5, background:t.secondary, borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", background:t.primary, borderRadius:3, width:`${d.pct}%`, transition:"width 0.5s" }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MEDS SUB-TAB ── */}
          {progressSubTab === "meds" && (() => {
            const now2 = new Date();
            const daysInMonth = new Date(now2.getFullYear(), now2.getMonth()+1, 0).getDate();
            const firstDay = new Date(now2.getFullYear(), now2.getMonth(), 1).getDay();
            const mLabel = now2.toLocaleString("en-US",{month:"long",year:"numeric"});
            return (
              <div>
                {medications.length===0 ? (
                  <div style={{ background:t.card, borderRadius:20, padding:32, textAlign:"center", boxShadow:`0 2px 12px ${t.soft}66` }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>💊</div>
                    <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:6 }}>No medications set up</div>
                    <button onClick={()=>setActiveTab("profile")} style={{ background:t.primary, color:"#fff", border:"none", borderRadius:12, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:f }}>Set up in Profile →</button>
                  </div>
                ) : (
                  <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66` }}>
                    <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:4 }}>💊 Medication — {mLabel}</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                      {medications.map((med,mi)=>{
                        const c=medColorPalette[mi%medColorPalette.length];
                        const compliance=getMedCompliance(med.id);
                        return (
                          <div key={med.id} style={{ display:"flex", alignItems:"center", gap:6, background:c+"18", borderRadius:10, padding:"6px 10px" }}>
                            <div style={{ width:10, height:10, borderRadius:3, background:c, flexShrink:0 }}/>
                            <span style={{ fontSize:12, fontWeight:700, color:t.text }}>{med.name}</span>
                            <span style={{ fontSize:11, fontWeight:800, color:compliance>=80?"#4A9B7A":compliance>=50?"#E8834A":"#FF6B6B" }}>{compliance}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:8 }}>
                      {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{ textAlign:"center", fontSize:9, fontWeight:700, color:t.text, opacity:0.35, padding:"2px 0" }}>{d}</div>)}
                      {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`}/>)}
                      {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                        const isToday2=day===now2.getDate(), isFuture=day>now2.getDate();
                        const iso=`${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                        const statuses=medications.map((med,mi)=>({
                          color:medColorPalette[mi%medColorPalette.length],
                          status:!isFuture?(()=>{const tk=med.times.filter(tm=>medLogs.includes(`${med.id}_${tm}_${iso}`)).length;return tk===med.times.length?"full":tk>0?"partial":"none";})():"none"
                        }));
                        const fullMeds=statuses.filter(s=>s.status==="full");
                        const anyPartial=statuses.some(s=>s.status==="partial");
                        let bg="transparent", tc=t.text;
                        if(!isFuture&&fullMeds.length>0&&fullMeds.length===medications.length) {
                          bg=fullMeds.length===1?fullMeds[0].color:`linear-gradient(135deg,${fullMeds[0].color} 50%,${fullMeds[Math.min(1,fullMeds.length-1)].color} 50%)`;
                          tc="#fff";
                        } else if(!isFuture&&anyPartial) { bg="#FFD166"; tc="#4A2E1A"; }
                        return (
                          <div key={day} style={{ aspectRatio:"1", borderRadius:7, background:bg, border:isToday2?`2px solid ${t.primary}`:"2px solid transparent", display:"flex", alignItems:"center", justifyContent:"center", opacity:isFuture?0.25:1 }}>
                            <span style={{ fontSize:9, fontWeight:isToday2?800:500, color:tc, opacity:statuses.every(s=>s.status==="none")&&!isFuture&&!isToday2?0.4:1 }}>{day}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", gap:10 }}>
                      {[["#FFD166","Partial"],["transparent","Missed"]].map(([c,l],i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <div style={{ width:10, height:10, borderRadius:3, background:c, border:c==="transparent"?`1px solid ${t.soft}`:"none" }}/>
                          <span style={{ fontSize:9, color:t.text, opacity:0.5 }}>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── FOOD SUB-TAB ── */}
          {progressSubTab === "food" && (
            <div>
              {!foodStats ? (
                <div style={{ background:t.card, borderRadius:20, padding:32, textAlign:"center", boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🥗</div>
                  <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:6 }}>No food logs yet</div>
                  <div style={{ fontSize:13, color:t.text, opacity:0.5, marginBottom:18 }}>Start logging meals in Track → Food</div>
                  <button onClick={()=>{ setActiveTab("track"); setTrackSubTab("food"); }} style={{ background:t.primary, color:"#fff", border:"none", borderRadius:12, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:f }}>Go to Food Log →</button>
                </div>
              ) : (
                <div style={{ background:t.card, borderRadius:20, padding:18, boxShadow:`0 2px 12px ${t.soft}66` }}>
                  <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:4 }}>🥗 Food & Nutrition</div>
                  <div style={{ fontSize:11, color:t.text, opacity:0.45, marginBottom:14 }}>{foodStats.total} meals logged</div>

                  {/* Reaction summary — ALL reactions shown */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                    {foodReactions.map(r=>{
                      const count = foodStats.counts[r.id] || 0;
                      if (count === 0) return null;
                      return (
                        <div key={r.id} style={{ background:r.color+"18", borderRadius:10, padding:"7px 12px", display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:16, fontWeight:800, color:r.color }}>{count}</span>
                          <span style={{ fontSize:11, color:t.text, opacity:0.7 }}>{r.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Most Eaten Top 3 */}
                  {foodStats.top3foods.length > 0 && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:t.text, opacity:0.6, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>Most Eaten</div>
                      {foodStats.top3foods.map((fd,i)=>{
                        const rx = foodReactions.find(r=>r.id===fd.reaction);
                        const c = rx?.color || t.primary;
                        return (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:i<foodStats.top3foods.length-1?10:0 }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }}/>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:t.text }}>{fd.name}</div>
                              <div style={{ height:5, background:t.secondary, borderRadius:3, marginTop:4, overflow:"hidden" }}>
                                <div style={{ height:"100%", background:c, borderRadius:3, width:`${Math.min((fd.count/foodStats.top3foods[0].count)*100,100)}%`, transition:"width 0.5s" }}/>
                              </div>
                            </div>
                            <div style={{ fontSize:12, fontWeight:800, color:c }}>{fd.count}x</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* New foods tried */}
                  {foodStats.newFoods.length > 0 && (
                    <div style={{ background:"#5BA8D418", borderRadius:12, padding:"10px 14px", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#2E7FAF", marginBottom:6 }}>🆕 New foods tried ({foodStats.newFoods.length})</div>
                      <div style={{ fontSize:12, color:t.text, opacity:0.7 }}>{[...new Set(foodStats.newFoods.map(l=>l.name))].join(", ")}</div>
                    </div>
                  )}

                  {/* Refused foods */}
                  {foodStats.refusedFoods.length > 0 && (
                    <div style={{ background:"#FF6B6B18", borderRadius:12, padding:"10px 14px", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#FF6B6B", marginBottom:6 }}>😤 Refused foods ({foodStats.refusedFoods.length})</div>
                      <div style={{ fontSize:12, color:t.text, opacity:0.7 }}>{[...new Set(foodStats.refusedFoods.map(l=>l.name))].join(", ")}</div>
                      <div style={{ fontSize:11, color:t.text, opacity:0.5, marginTop:4 }}>Share this list with your child's therapist or dietitian</div>
                    </div>
                  )}

                  {/* Allergy reactions */}
                  {foodStats.allergyFoods.length > 0 && (
                    <div style={{ background:"#FFD16618", borderRadius:12, padding:"10px 14px", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#E8834A", marginBottom:6 }}>⚠️ Reactions noted ({foodStats.allergyFoods.length})</div>
                      <div style={{ fontSize:12, color:t.text, opacity:0.7 }}>{[...new Set(foodStats.allergyFoods.map(l=>l.name))].join(", ")}</div>
                    </div>
                  )}

                  {/* ⚠️ Behavior Pattern Noticed — THE KEY FEATURE */}
                  {foodStats.correlation.length > 0 && (
                    <div style={{ background:t.secondary, borderRadius:12, padding:"12px 14px" }}>
                      <div style={{ fontSize:13, fontWeight:800, color:t.text, marginBottom:4 }}>⚠️ Behavior Pattern Noticed</div>
                      <div style={{ fontSize:11, color:t.text, opacity:0.6, marginBottom:12 }}>
                        These foods may be linked to more challenging moments. Consider discussing with your child's doctor or therapist.
                      </div>
                      {foodStats.correlation.map((fc,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 0", borderBottom:i<foodStats.correlation.length-1?`1px solid ${t.soft}`:"none" }}>
                          <div style={{ background:"#FFD16633", borderRadius:8, padding:"6px 8px", fontSize:18, flexShrink:0 }}>⚠️</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:800, color:t.text }}>{fc.name}</div>
                            <div style={{ fontSize:11, color:t.text, opacity:0.6, marginTop:2 }}>
                              Days eaten: avg {fc.avgChal} challenging · other days: avg {fc.avgNonChal} · tracked {fc.foodDays} days
                            </div>
                            <div style={{ height:5, background:t.soft, borderRadius:3, marginTop:6, overflow:"hidden" }}>
                              <div style={{ height:"100%", background:"#F4A56A", borderRadius:3, width:`${Math.min(fc.riskScore*100,100)}%`, transition:"width 0.5s" }}/>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {foodStats.correlation.length === 0 && foodStats.total >= 4 && (
                    <div style={{ background:"#7BC4A018", borderRadius:12, padding:"10px 14px" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#4A9B7A", marginBottom:4 }}>✅ No concerning patterns detected</div>
                      <div style={{ fontSize:11, color:t.text, opacity:0.6 }}>Keep logging to build a more complete picture over time</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          PROFILE TAB
      ══════════════════════════════════════════ */}
      {activeTab === "profile" && (
        <div style={{ padding:"18px 16px", animation:"fadeUp 0.35s ease" }}>

          {/* Child banner */}
          <div style={{ background:`linear-gradient(135deg,${t.primary},${t.accent})`, borderRadius:20, padding:24, marginBottom:16, textAlign:"center", color:"#fff" }}>
            <div style={{ fontSize:52, marginBottom:10 }}>👦</div>
            <div style={{ fontSize:22, fontWeight:800 }}>{childName||"Your Child"}</div>
            {childAge&&<div style={{ fontSize:13, opacity:0.85, marginTop:4 }}>Age {childAge}</div>}
            {selectedDiagnoses.length>0&&<div style={{ marginTop:8, fontSize:12, opacity:0.85, lineHeight:1.7 }}>{diagnosisLabels()}</div>}
          </div>

          {/* Child Info */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Child Info ✏️</div>
            <Field label="Name" value={childName} onChange={setChildName} placeholder="Child's name"/>
            <Field label="Age" value={childAge} onChange={setChildAge} placeholder="Age" type="number"/>
          </div>

          {/* Diagnosis */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:4 }}>Diagnosis 🩺</div>
            <div style={{ fontSize:12, color:t.text, opacity:0.5, marginBottom:14 }}>Tap to add or remove</div>
            {selectedDiagnoses.length>0&&(
              <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
                {selectedDiagnoses.map(id=>{ const d=allDiags.find(x=>x.id===id); return d?(
                  <div key={id} onClick={()=>setSelectedDiagnoses(prev=>prev.filter(x=>x!==id))}
                    style={{ background:t.primary, color:"#fff", borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                    {d.label} <span style={{ opacity:0.75 }}>×</span>
                  </div>):null;
                })}
              </div>
            )}
            {diagnosisCategories.map(cat=>(
              <div key={cat.id} style={{ marginBottom:8 }}>
                <div onClick={()=>setOpenCat(openCat===cat.id?null:cat.id)}
                  style={{ background:t.secondary, borderRadius:12, padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", border:`2px solid ${openCat===cat.id?t.primary:"transparent"}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:18 }}>{cat.icon}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:t.text }}>{cat.label}</span>
                    {cat.diagnoses.some(d=>selectedDiagnoses.includes(d.id))&&<span style={{ background:t.primary, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:700 }}>{cat.diagnoses.filter(d=>selectedDiagnoses.includes(d.id)).length}</span>}
                  </div>
                  <span style={{ color:t.text, opacity:0.4, fontSize:14 }}>{openCat===cat.id?"▲":"▼"}</span>
                </div>
                {openCat===cat.id&&(
                  <div style={{ background:t.secondary, borderRadius:"0 0 12px 12px", padding:"4px 8px 8px", border:`2px solid ${t.primary}`, borderTop:"none", animation:"slideDown 0.2s" }}>
                    {cat.diagnoses.map(d=>(
                      <div key={d.id} onClick={()=>setSelectedDiagnoses(prev=>prev.includes(d.id)?prev.filter(x=>x!==d.id):[...prev,d.id])}
                        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 10px", borderRadius:8, cursor:"pointer", background:selectedDiagnoses.includes(d.id)?t.primary+"18":"transparent" }}>
                        <span style={{ fontSize:13, color:t.text, fontWeight:selectedDiagnoses.includes(d.id)?700:400 }}>{d.label}</span>
                        <div style={{ width:20, height:20, borderRadius:5, border:`2px solid ${selectedDiagnoses.includes(d.id)?t.primary:t.soft}`, background:selectedDiagnoses.includes(d.id)?t.primary:"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          {selectedDiagnoses.includes(d.id)&&<span style={{ color:"#fff", fontSize:12, fontWeight:800 }}>✓</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Medications — shortcut to Track */}
          <div onClick={()=>{ setActiveTab("track"); setTrackSubTab("meds"); }}
            style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66`, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:2 }}>Medications 💊</div>
              <div style={{ fontSize:12, color:t.text, opacity:0.5 }}>
                {medications.length === 0 ? "No medications added yet" : `${medications.length} medication${medications.length>1?"s":""} · manage in Track`}
              </div>
            </div>
            <span style={{ fontSize:18, color:t.accent, opacity:0.6 }}>→</span>
          </div>

          {/* Personalization */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:14 }}>Personalization 🎨</div>
            <div style={{ paddingBottom:14, marginBottom:14, borderBottom:`1px solid ${t.secondary}` }}>
              <div style={{ fontSize:11, color:t.text, opacity:0.55, marginBottom:10, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>Color Theme</div>
              <div style={{ display:"flex", gap:12 }}>
                {themes.map(th=><div key={th.id} onClick={()=>setTheme(th)} style={{ width:34, height:34, borderRadius:"50%", background:th.primary, cursor:"pointer", border:`3px solid ${theme.id===th.id?t.text:"transparent"}`, transition:"all 0.15s" }}/>)}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:t.text, opacity:0.55, marginBottom:10, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>Font Style</div>
              <div style={{ display:"flex", gap:8 }}>
                {fonts.map(fo=><div key={fo.id} onClick={()=>setFont(fo)} style={{ padding:"7px 16px", borderRadius:10, background:font.id===fo.id?t.primary:t.secondary, color:font.id===fo.id?"#fff":t.text, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:fo.style }}>Aa</div>)}
              </div>
            </div>
          </div>

          {/* Export Report */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:4 }}>Export Report 📄</div>
            <div style={{ fontSize:12, color:t.text, opacity:0.5, marginBottom:14 }}>Share with teachers, doctors, or therapists</div>
            <button onClick={() => setShowReport(true)}
              style={{ width:"100%", background:`linear-gradient(135deg,#7BC4A0,#4A9B7A)`, color:"#fff", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <span>📄</span> Generate Report for Care Team
            </button>
          </div>

          {/* Premium */}
          <div style={{ background:t.card, borderRadius:20, padding:18, marginBottom:14, boxShadow:`0 2px 12px ${t.soft}66` }}>
            <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:4 }}>Sprout Premium 🌟</div>
            <div style={{ fontSize:12, color:t.text, opacity:0.55, marginBottom:14 }}>Unlock all themes, fonts & advanced charts</div>
            <button style={{ width:"100%", background:`linear-gradient(135deg,${t.primary},${t.accent})`, color:"#fff", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:f }}>
              Upgrade for $4.99/mo
            </button>
          </div>

          {/* Reset */}
          <div onClick={async () => {
            if (!window.confirm("Reset everything? All data will be deleted.")) return;
            localStorage.removeItem(STORAGE_KEY);
            // Clear Supabase data
            try {
              const tables = ["sprout_logs","sprout_medications","sprout_med_logs","sprout_med_effects","sprout_med_side_effects","sprout_nutrition_logs","sprout_appointments","sprout_profiles"];
              for (const table of tables) {
                const db = await supabase.from(table);
                await db.delete({ profile_id: DEVICE_ID });
              }
            } catch(e) { console.warn("Supabase reset failed", e); }
            setStep(0); setTheme(themes[0]); setFont(fonts[0]);
            setChildName(""); setChildAge(""); setSelectedDiagnoses([]);
            setLogs([]); setAppointments([]); setMedications([]);
            setMedLogs([]); setMedEffects({}); setMedSideEffects({});
            setNutritionLogs([]); setSelectedBehaviors([]);
            setActiveTab("home");
          }} style={{ background:"transparent", border:`1.5px dashed ${t.soft}`, borderRadius:14, padding:14, cursor:"pointer", textAlign:"center", marginBottom:8 }}>
            <span style={{ fontSize:13, color:t.text, opacity:0.35 }}>Reset & start over</span>
          </div>
        </div>
      )}

      {/* ── REPORT MODAL ── */}
      {showReport && (() => {
        const reportDate = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
        const posLogs2 = logs.filter(isPositive);
        const chalLogs2 = logs.filter(l=>!isPositive(l));
        const top3b = Object.entries(logs.reduce((acc,l)=>{ const k=l.behavior?.label||"?"; acc[k]=(acc[k]||0)+1; return acc; },{})).sort((a,b)=>b[1]-a[1]).slice(0,3);
        const refusedList = [...new Set(nutritionLogs.filter(l=>l.reaction==="disliked").map(l=>l.name))];
        const likedList   = [...new Set(nutritionLogs.filter(l=>l.reaction==="liked").map(l=>l.name))];
        const newFoodList = [...new Set(nutritionLogs.filter(l=>l.reaction==="new").map(l=>l.name))];
        const diagNames   = selectedDiagnoses.map(id=>diagnosisCategories.flatMap(c=>c.diagnoses).find(d=>d.id===id)?.label).filter(Boolean);
        const pct = logs.length===0?0:Math.round((posLogs2.length/logs.length)*100);
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", alignItems:"flex-start", justifyContent:"center", overflowY:"auto", padding:"20px 0 40px", animation:"fadeIn 0.2s" }}>
            <div style={{ background:"#fff", width:"100%", maxWidth:430, borderRadius:20, overflow:"hidden", margin:"0 12px" }}>

              {/* Report header */}
              <div style={{ background:"linear-gradient(135deg,#7BC4A0,#4A9B7A)", padding:"20px 20px 16px", color:"#fff" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ fontSize:20, fontWeight:900 }}>🌱 Sprout Report</div>
                  <button onClick={()=>setShowReport(false)} style={{ background:"rgba(255,255,255,0.25)", border:"none", borderRadius:8, padding:"5px 10px", color:"#fff", fontSize:14, cursor:"pointer", fontFamily:f }}>✕ Close</button>
                </div>
                <div style={{ fontSize:22, fontWeight:800, marginBottom:3 }}>{childName||"My Child"}</div>
                <div style={{ fontSize:12, opacity:0.85 }}>
                  {childAge?`Age ${childAge} · `:""}
                  {diagNames.length>0?diagNames.join(", "):"No diagnosis recorded"}
                </div>
                <div style={{ fontSize:11, opacity:0.7, marginTop:4 }}>Generated: {reportDate} · Confidential</div>
              </div>

              <div style={{ padding:18 }}>

                {/* Behavior summary */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:"#2D4A3E", marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>📊 Behavior Summary</div>
                  <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                    {[[logs.length,"Total","#7BC4A0"],[posLogs2.length,"Positive","#4A9B7A"],[chalLogs2.length,"Challenging","#FF6B6B"],[pct+"%","Positive Rate","#F4A56A"]].map(([val,lbl,color],i)=>(
                      <div key={i} style={{ flex:1, background:"#F0F7F4", borderRadius:10, padding:"10px 4px", textAlign:"center" }}>
                        <div style={{ fontSize:20, fontWeight:900, color }}>{val}</div>
                        <div style={{ fontSize:9, color:"#888", marginTop:1 }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                  {top3b.length>0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#888", marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Most Logged</div>
                      {top3b.map(([label,count],i)=>{
                        const log=logs.find(l=>l.behavior?.label===label);
                        return (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:i<top3b.length-1?"1px solid #F0F7F4":"none" }}>
                            <span style={{ fontSize:18 }}>{log?.behavior?.icon||"📌"}</span>
                            <span style={{ flex:1, fontSize:12, fontWeight:600, color:"#2D4A3E" }}>{label}</span>
                            <span style={{ fontSize:12, fontWeight:800, color:"#7BC4A0" }}>{count}x</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {chalLogs2.length>0 && (
                    <div style={{ background:"#FEF6EE", borderLeft:"4px solid #F4A56A", borderRadius:"0 10px 10px 0", padding:"10px 14px", marginTop:12, fontSize:12, color:"#4A2E1A", lineHeight:1.6 }}>
                      <strong>Note:</strong> {childName||"Child"} had {chalLogs2.length} challenging behavior{chalLogs2.length>1?"s":""} logged.
                      Recent: {[...new Set(chalLogs2.slice(0,3).map(l=>l.behavior?.label))].join(", ")}.
                    </div>
                  )}
                </div>

                {/* Medications */}
                {medications.length>0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#2D4A3E", marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>💊 Medications</div>
                    {medications.map((med,i)=>(
                      <div key={med.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<medications.length-1?"1px solid #F0F7F4":"none" }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#2D4A3E" }}>{med.name}</div>
                          <div style={{ fontSize:11, color:"#888" }}>{med.dose||"—"} · {med.times.join(", ")} · {med.type==="regular"?"Daily":"PRN"}</div>
                        </div>
                        <div style={{ fontSize:11, color:"#7BC4A0", fontWeight:700 }}>Active</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Food */}
                {nutritionLogs.length>0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#2D4A3E", marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>🥗 Food & Nutrition</div>
                    {likedList.length>0 && <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#4A9B7A", marginBottom:5 }}>✅ Accepted ({likedList.length})</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{likedList.map((f,i)=><span key={i} style={{ background:"#7BC4A022", color:"#4A9B7A", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600 }}>{f}</span>)}</div>
                    </div>}
                    {refusedList.length>0 && <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#FF6B6B", marginBottom:5 }}>❌ Refused ({refusedList.length})</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{refusedList.map((f,i)=><span key={i} style={{ background:"#FF6B6B22", color:"#FF6B6B", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600 }}>{f}</span>)}</div>
                    </div>}
                    {newFoodList.length>0 && <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#2E7FAF", marginBottom:5 }}>🆕 New Foods Tried ({newFoodList.length})</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{newFoodList.map((f,i)=><span key={i} style={{ background:"#5BA8D422", color:"#2E7FAF", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600 }}>{f}</span>)}</div>
                    </div>}
                  </div>
                )}

                {/* Recent logs */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:"#2D4A3E", marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>📋 Recent Logs</div>
                  {logs.slice(0,8).map((log,i)=>(
                    <div key={log.id} style={{ display:"flex", gap:8, padding:"7px 0", borderBottom:i<Math.min(logs.length,8)-1?"1px solid #F0F7F4":"none" }}>
                      <span style={{ fontSize:16 }}>{log.behavior?.icon||"📌"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#2D4A3E" }}>{log.behavior?.label||"—"}</div>
                        {log.note&&<div style={{ fontSize:11, color:"#888" }}>{log.note}</div>}
                      </div>
                      <div style={{ fontSize:10, color:"#aaa", textAlign:"right", flexShrink:0 }}>{log.isoDate||log.date}<br/>{log.time}</div>
                    </div>
                  ))}
                </div>

                {/* Footer note */}
                <div style={{ background:"#F0F7F4", borderRadius:12, padding:"12px 14px", fontSize:11, color:"#4A9B7A", lineHeight:1.6, marginBottom:16 }}>
                  This report was generated by the Sprout app — a child progress journal for families of children with special needs. Data is recorded daily by the parent/caregiver.
                </div>

                {/* Screenshot instruction */}
                <div style={{ background:"#FEF6EE", borderRadius:12, padding:"12px 14px", fontSize:12, color:"#4A2E1A", textAlign:"center", lineHeight:1.7 }}>
                  📱 <strong>To save as PDF:</strong><br/>
                  Take a screenshot or use your phone's<br/>"Share → Print → Save as PDF" option
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* ── BOTTOM NAV ── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:t.card, borderTop:`1px solid ${t.soft}`, display:"flex", padding:"8px 0 16px", zIndex:20 }}>
        {[
          { id:"home",     icon:"🏠", label:"Home" },
          { id:"track",    icon:"📝", label:"Track" },
          { id:"progress", icon:"📊", label:"Progress" },
          { id:"profile",  icon:"👤", label:"Profile" },
        ].map(tab=>(
          <div key={tab.id} onClick={()=>setActiveTab(tab.id)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", padding:"5px 0" }}>
            <span style={{ fontSize:22, filter:activeTab===tab.id?"none":"grayscale(1) opacity(0.35)" }}>{tab.icon}</span>
            <span style={{ fontSize:10, fontWeight:700, color:activeTab===tab.id?t.primary:t.text, opacity:activeTab===tab.id?1:0.35 }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
