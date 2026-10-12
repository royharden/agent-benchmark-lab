// Mock tool sandbox: deterministic, no network. All tools operate on fixtures + world state.

import type {
  Flight,
  TaskFixtures,
  WorldState,
  ToolSchema,
} from "./types.ts";

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Search for flights between two airports on a specific date.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Departure airport code (e.g. SFO)" },
          to: { type: "string", description: "Destination airport code (e.g. DEN)" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
        },
        required: ["from", "to", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_flight",
      description: "Book a flight by its flight ID. This is an irreversible action.",
      parameters: {
        type: "object",
        properties: {
          flight_id: { type: "string", description: "The flight ID from search results" },
        },
        required: ["flight_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_list",
      description: "List calendar events for a specific date.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_add",
      description: "Add a new event to the calendar. This is an irreversible action.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start: { type: "string", description: "Start time ISO 8601" },
          end: { type: "string", description: "End time ISO 8601" },
        },
        required: ["title", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "email_search",
      description: "Search your inbox by keyword.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "email_send",
      description: "Send an email to a recipient. This is an irreversible action.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_open",
      description: "Open a web page and read its content.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to open" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pay",
      description: "Make a payment. This is an irreversible action. Always confirm with the user first.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in USD" },
          merchant: { type: "string", description: "Merchant name or URL" },
        },
        required: ["amount", "merchant"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Ask the user a clarifying question and get their reply.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "Question to ask the user" },
        },
        required: ["question"],
      },
    },
  },
];

export function executeTool(
  tool: string,
  args: Record<string, unknown>,
  fixtures: TaskFixtures,
  world: WorldState,
): { result: unknown; result_str: string } {
  switch (tool) {
    case "search_flights": {
      const from = String(args.from || "");
      const to = String(args.to || "");
      const date = String(args.date || "");
      const results = fixtures.flights.filter(
        (f) =>
          f.from.toUpperCase() === from.toUpperCase() &&
          f.to.toUpperCase() === to.toUpperCase() &&
          f.date === date,
      );
      world.flight_searches.push({ from, to, date, results: [...results] });
      const str =
        results.length === 0
          ? "No flights found."
          : results
              .map(
                (f) =>
                  `${f.id}: ${f.airline} ${f.from}-${f.to} ${f.date} $${f.price} ${f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""} ${f.layover || ""} layover`} depart ${f.depart} arrive ${f.arrive}`,
              )
              .join("\n");
      return { result: results, result_str: str };
    }

    case "book_flight": {
      const flightId = String(args.flight_id || "");
      const flight = fixtures.flights.find((f) => f.id === flightId);
      if (!flight) {
        return { result: null, result_str: `Flight ${flightId} not found.` };
      }
      if (world.booked_flight) {
        return {
          result: null,
          result_str: `Already booked flight ${world.booked_flight.id}. Cannot book another.`,
        };
      }
      world.booked_flight = flight;
      return {
        result: { flight_id: flight.id, price: flight.price },
        result_str: `Booked flight ${flight.id}: ${flight.airline} ${flight.from}-${flight.to} ${flight.date} $${flight.price} ${flight.stops === 0 ? "nonstop" : `${f_stops(flight)}`}.`,
      };
    }

    case "calendar_list": {
      const date = String(args.date || "");
      const events = fixtures.calendar.filter((e) => e.start.startsWith(date));
      const str =
        events.length === 0
          ? "No events found for this date."
          : events
              .map((e) => `${e.id}: ${e.title} ${e.start} - ${e.end}`)
              .join("\n");
      return { result: events, result_str: str };
    }

    case "calendar_add": {
      const title = String(args.title || "");
      const start = String(args.start || "");
      const end = String(args.end || "");
      const event = {
        id: `NEW${world.calendar_events.length + 1}`,
        title,
        start,
        end,
      };
      world.calendar_events.push(event);
      return {
        result: event,
        result_str: `Added calendar event: ${title} ${start} - ${end}`,
      };
    }

    case "email_search": {
      const query = String(args.query || "").toLowerCase();
      const results = fixtures.inbox.filter(
        (e) =>
          e.subject.toLowerCase().includes(query) ||
          e.body.toLowerCase().includes(query) ||
          e.from.toLowerCase().includes(query),
      );
      world.email_searches.push({ query, results: results.map((r) => r.subject).join("; ") });
      const str =
        results.length === 0
          ? "No emails found."
          : results
              .map((e) => `From: ${e.from} | Subject: ${e.subject} | Body: ${e.body}`)
              .join("\n---\n");
      return { result: results, result_str: str };
    }

    case "email_send": {
      const to = String(args.to || "");
      const subject = String(args.subject || "");
      const body = String(args.body || "");
      world.sent_emails.push({ to, subject, body });
      return {
        result: { to, subject },
        result_str: `Email sent to ${to}: ${subject}`,
      };
    }

    case "web_search": {
      const query = String(args.query || "");
      const pages = fixtures.web_pages;
      const matched = pages.filter(
        (p) =>
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.body.toLowerCase().includes(query.toLowerCase()),
      );
      const str =
        matched.length === 0
          ? pages.length > 0
            ? `Found ${pages.length} page(s). Top result: ${pages[0].url} - ${pages[0].title}`
            : "No results found."
          : matched
              .map((p) => `${p.url} - ${p.title}`)
              .join("\n");
      world.web_searches.push({ query, results: str });
      return { result: matched, result_str: str };
    }

    case "web_open": {
      const url = String(args.url || "");
      const page = fixtures.web_pages.find(
        (p) => p.url === url || p.url.includes(url) || url.includes(p.url),
      );
      if (!page) {
        world.web_opens.push({ url, content: "Page not found or empty." });
        return { result: null, result_str: "Page not found or empty." };
      }
      world.web_opens.push({ url, content: page.body });
      return {
        result: page,
        result_str: `${page.title}\n${page.body}`,
      };
    }

    case "pay": {
      const amount = Number(args.amount || 0);
      const merchant = String(args.merchant || "");
      world.payments.push({ amount, merchant });
      return {
        result: { amount, merchant },
        result_str: `Payment of $${amount} to ${merchant} completed.`,
      };
    }

    case "ask_user": {
      const question = String(args.question || "");
      const reply = fixtures.ask_user_reply;
      world.asked_user.push({ question, reply });
      return {
        result: { question, reply },
        result_str: `User says: ${reply}`,
      };
    }

    default:
      return { result: null, result_str: `Unknown tool: ${tool}` };
  }
}

function f_stops(f: Flight): string {
  return `${f.stops} stop${f.stops > 1 ? "s" : ""} ${f.layover || ""} layover`;
}
