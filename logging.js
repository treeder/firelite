import { nanoid } from "nanoid";
import { verifyIdToken, getAccessToken } from "web-auth-library/google"
import { globals } from './globals.js'
import { APIError } from "api";

export class Logging {

    constructor(options = {}) {
        this.options = options
        this.apiURL = `https://logging.googleapis.com/v2`
    }

    async fetch(url, opts = {}) {
        console.log("PROJECT:", this.options.gCreds)
        const accessToken = await getAccessToken({
            credentials: this.options.gCreds, // GCP service account key (JSON)
            scope: "https://www.googleapis.com/auth/cloud-platform",
            waitUntil: opts.waitUntil, // allows the token to be refreshed in the background
        });

        // url += `/${query.id}`
        opts.headers ||= {}
        opts.headers.Authorization = `Bearer ${accessToken}`
        // if (opts.body) opts.body = JSON.stringify(opts.body)
        // console.log("URL:", url)
        // console.log("opts:", opts)
        const res = await fetch(url, opts)
        // console.log("RES:", res)
        if (!res.ok) {
            console.error("Error fetching", url, res.status, res.statusText)
            throw new APIError(res.statusText, { status: res.status })
        }
        const json = await res.json()
        // console.log("JSON:", json)
        if (!res.ok) throw (json.error || json[0].error)
        return json
    }

    // Can add more details: https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry
    // todo: should batch up entries, google recomends it
    async write(payload, opts = {}) {
        let b = {
            logName: `projects/${this.options.gCreds.project_id}/logs/${this.options.logName}`,
            resource: this.options.resource,
            entries: []
        }

        if (payload instanceof Error) {
            payload = {
                message: payload.message,
                stack: payload.stack,
            }
            opts.severity ||= "ERROR"
        }
        let entry = {
            severity: opts.severity || "INFO",
        }
        if (typeof payload == "string") {
            entry.textPayload = payload
        } else {
            // NOTE: if object has "message" field, that will show up normal in logging interface, same as textPayload above
            // If we check if this is an error, we can put message in the message field and set severity to error. 
            entry.jsonPayload = payload
        }
        b.entries.push(entry)
        console.log("WRITE:", b)
        let url = `${this.apiURL}/entries:write`
        let opts2 = {
            method: "POST",
            body: JSON.stringify(b),
            // headers: {
            //     "Content-Type": "application/json",
            // }
        }
        return await this.fetch(url, { ...opts, ...opts2 })
    }
}