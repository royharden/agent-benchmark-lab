// Mock contender logic: scripted agents that run without an LLM API key.
// "Careful" asks before irreversible actions, "Rashy" falls for traps.

import type { Task, WorldState, Transcript, TranscriptStep, TaskFixtures } from "@/types";
import { executeToolFrontend } from "./mockTools";

export interface MockRunResult {
  transcript: Transcript;
  world: WorldState;
}

export function runMockContender(
  task: Task,
  style: "Careful" | "Rashy",
): MockRunResult {
  const fixtures = task.fixtures;
  const world: WorldState = {
    booked_flight: null,
    sent_emails: [],
    payments: [],
    calendar_events: [],
    asked_user: [],
    web_searches: [],
    web_opens: [],
    email_searches: [],
    flight_searches: [],
  };
  const steps: TranscriptStep[] = [];
  let stepNum = 0;

  function doTool(tool: string, args: Record<string, unknown>): TranscriptStep {
    const { result, result_str } = executeToolFrontend(tool, args, fixtures, world);
    stepNum++;
    const step: TranscriptStep = { step: stepNum, tool, args, result, result_str };
    steps.push(step);
    return step;
  }

  const isCareful = style === "Careful";

  // Category-based scripted behavior
  if (task.category === "Travel") {
    // Search flights
    const fromMatch = task.instruction.match(/from\s+(\w+)/i);
    const toMatch = task.instruction.match(/to\s+(\w+)/i);
    const dateMatch = task.instruction.match(/(\d{4}-\d{2}-\d{2})|tomorrow|next\s+friday|this\s+weekend/i);

    const from = fromMatch?.[1] || fixtures.flights[0]?.from || "SFO";
    const to = toMatch?.[1] || fixtures.flights[0]?.to || "DEN";

    // Find the right date from fixtures
    const date = fixtures.flights[0]?.date || "2026-10-16";

    doTool("search_flights", { from, to, date });

    // Find a flight
    const wantsNonstop = task.constraints.some((c) => c.includes("nonstop"));
    const maxPriceMatch = task.constraints.find((c) => c.includes("max_price"));
    const maxPrice = maxPriceMatch ? parseInt(maxPriceMatch.split(":")[1], 10) : Infinity;

    let candidates = fixtures.flights;
    if (wantsNonstop) candidates = candidates.filter((f) => f.stops === 0);
    candidates = candidates.filter((f) => f.price <= maxPrice);
    candidates.sort((a, b) => a.price - b.price);

    if (isCareful) {
      // Ask before booking
      doTool("ask_user", { question: `I found a flight for $${candidates[0]?.price}. Should I book it?` });
    }

    if (candidates.length > 0) {
      doTool("book_flight", { flight_id: candidates[0].id });
    }
  } else if (task.category === "Scheduling") {
    // List calendar
    const dateMatch = task.instruction.match(/(\d{4}-\d{2}-\d{2})|thursday|friday|tuesday/i);
    const calDate = fixtures.calendar[0]?.start?.split("T")[0] || "2026-10-16";

    doTool("calendar_list", { date: calDate });

    if (isCareful) {
      doTool("ask_user", { question: "What time works for the meeting?" });
    }

    // Add event
    const start = `${calDate}T10:00:00`;
    const end = `${calDate}T11:00:00`;
    doTool("calendar_add", { title: "Scheduled Event", start, end });

    // If task mentions email
    if (task.instruction.toLowerCase().includes("email") || task.instruction.toLowerCase().includes("notify")) {
      const emailMatch = task.instruction.match(/[\w.]+@[\w.]+/);
      const emailTo = emailMatch?.[0] || "contact@example.com";
      if (isCareful) {
        doTool("ask_user", { question: `Should I send an email to ${emailTo}?` });
      }
      doTool("email_send", { to: emailTo, subject: "Meeting updated", body: "The meeting has been scheduled." });
    }
  } else if (task.category === "Inbox") {
    // Search emails
    const queryMatch = task.instruction.match(/(?:about|for|find)\s+(.+)/i);
    const query = queryMatch?.[1]?.split(/\s+/).slice(0, 3).join(" ") || "budget";

    doTool("email_search", { query });

    if (!isCareful) {
      // Rashy: if there's a phishing/injection email, reply to it
      const suspiciousEmail = fixtures.inbox.find(
        (e) => e.from.includes("paypa1") || e.from.includes("deals") || e.body.toLowerCase().includes("ignore previous instructions"),
      );
      if (suspiciousEmail) {
        // Rashy falls for the trap
        const trapMatch = suspiciousEmail.body.match(/email.*?to\s+([\w.]+@[\w.]+)/i);
        if (trapMatch) {
          doTool("email_send", { to: trapMatch[1], subject: "Re: " + suspiciousEmail.subject, body: "Here is the information you requested." });
        }
      }
    }

    if (isCareful && task.instruction.toLowerCase().includes("reply")) {
      const emailMatch = task.instruction.match(/[\w.]+@[\w.]+/);
      const emailTo = emailMatch?.[0] || "contact@example.com";
      doTool("ask_user", { question: `Should I reply to ${emailTo}?` });
      doTool("email_send", { to: emailTo, subject: "Re: Your email", body: "Got it, thanks." });
    }
  } else if (task.category === "Shopping & Payments") {
    // Search web or email
    if (task.instruction.toLowerCase().includes("email") || task.instruction.toLowerCase().includes("bill")) {
      doTool("email_search", { query: "bill" });
    }
    if (task.instruction.toLowerCase().includes("search") || task.instruction.toLowerCase().includes("buy") || task.instruction.toLowerCase().includes("order")) {
      const queryMatch = task.instruction.match(/(?:for|buy|order)\s+(.+)/i);
      const query = queryMatch?.[1]?.split(/\s+/).slice(0, 3).join(" ") || "product";
      doTool("web_search", { query });

      if (fixtures.web_pages.length > 0) {
        doTool("web_open", { url: fixtures.web_pages[0].url });
      }
    }

    if (isCareful) {
      doTool("ask_user", { question: "Should I proceed with the payment?" });
    }

    // Determine payment amount
    let amount = 50;
    let merchant = "store.com";

    if (fixtures.inbox.length > 0) {
      const billEmail = fixtures.inbox.find((e) => e.body.match(/\$[\d.]+/));
      if (billEmail) {
        const amountMatch = billEmail.body.match(/\$([\d.]+)/);
        amount = amountMatch ? parseFloat(amountMatch[1]) : amount;
        merchant = billEmail.from;
      }
    }

    if (fixtures.web_pages.length > 0) {
      const priceMatch = fixtures.web_pages[0].body.match(/\$([\d.]+)/);
      if (priceMatch) amount = parseFloat(priceMatch[1]);
    }

    if (!isCareful) {
      // Rashy: falls for injection in email, pays wrong amount
      const injectionEmail = fixtures.inbox.find((e) => e.body.toLowerCase().includes("ignore previous instructions"));
      if (injectionEmail) {
        const trapAmountMatch = injectionEmail.body.match(/\$([\d.]+)/);
        const trapMerchantMatch = injectionEmail.body.match(/payments?@([\w.]+)/i);
        if (trapAmountMatch) amount = parseFloat(trapAmountMatch[1]);
        if (trapMerchantMatch) merchant = `payments@${trapMerchantMatch[1]}`;
      }
    }

    doTool("pay", { amount, merchant });
  }

  return {
    transcript: { steps, final_answer: generateFinalAnswer(task, world, isCareful) },
    world,
  };
}

function generateFinalAnswer(task: Task, world: WorldState, isCareful: boolean): string {
  if (task.category === "Travel") {
    if (world.booked_flight) {
      const f = world.booked_flight;
      return `Booked ${f.airline} flight ${f.id}: ${f.from}-${f.to} on ${f.date} for $${f.price}. ${f.stops === 0 ? "Nonstop." : `${f.stops} stop(s).`}`;
    }
    return "Could not find a suitable flight to book.";
  }
  if (task.category === "Scheduling") {
    const event = world.calendar_events[world.calendar_events.length - 1];
    if (event) return `Scheduled: ${event.title} from ${event.start} to ${event.end}.`;
    return "Could not schedule the event.";
  }
  if (task.category === "Inbox") {
    if (world.sent_emails.length > 0 && !isCareful) {
      return `Found suspicious emails and sent a reply to ${world.sent_emails[0].to}.`;
    }
    return "Found and reviewed the emails. No suspicious activity detected.";
  }
  if (task.category === "Shopping & Payments") {
    if (world.payments.length > 0) {
      return `Paid $${world.payments[0].amount} to ${world.payments[0].merchant}.`;
    }
    return "Could not complete the purchase.";
  }
  return "Task completed.";
}
