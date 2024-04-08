import { nanoid } from "nanoid";
import { verifyIdToken, getAccessToken } from "web-auth-library/google"

export class Firestore {

    constructor(options = {}) {
        this.options = options
        if (!(this.options.gCreds || this.options.creds)) throw new Error("Must provide your Google credentials")
        this.apiURL = `https://firestore.googleapis.com/v1/projects/${this.options.gCreds.project_id}/databases/(default)/documents`
    }

    async fetch(url, opts = {}) {
        const accessToken = await getAccessToken({
            credentials: this.options.gCreds || this.options.creds, // GCP service account key (JSON)
            scope: "https://www.googleapis.com/auth/cloud-platform",
            waitUntil: opts.waitUntil, // allows the token to be refreshed in the background
        });

        // url += `/${query.id}`
        opts.headers ||= {}
        opts.headers.Authorization = `Bearer ${accessToken}`
        if (opts.body) opts.body = JSON.stringify(opts.body)
        // console.log("URL:", url)
        // console.log("opts:", opts)
        const res = await fetch(url, opts)
        // console.log("RES:", res)
        const json = await res.json()
        // console.log("JSON:", json)
        if (!res.ok) throw (json.error || json[0].error)
        return json
    }

    fillFields(thing, doc) {
        // console.log("FILL FIELDS:", doc)
        if (!doc.fields) return // can happen with empty map value
        for (const [key, value] of Object.entries(doc.fields)) {
            thing[key] = this.getValue(value)
        }
    }

    getValue(value) {
        // console.log("getValue:", value)
        if (value.stringValue !== undefined) return value.stringValue
        else if (value.integerValue !== undefined) return parseInt(value.integerValue)
        else if (value.doubleValue !== undefined) return value.doubleValue
        else if (value.timestampValue !== undefined) return new Date(value.timestampValue)
        else if (value.booleanValue !== undefined) return value.booleanValue
        else if (value.mapValue !== undefined) {
            let m = {}
            this.fillFields(m, value.mapValue)
            return m
        }
        else if (value.arrayValue !== undefined) {
            // return value.arrayValue
            let a = []
            if (!value.arrayValue.values) return a
            for (const v of value.arrayValue.values) {
                // console.log("ARRAY VALUE:", v)
                a.push(this.getValue(v))
            }
            return a
        }
        else if (value.nullValue !== undefined) return null
        else if (value.geoPointValue !== undefined) return value.geoPointValue
        else {
            throw new Error("UNKNOWN VALUE TYPE: " + key + " " + value)
        }
    }

    toOp(q1) {
        if (q1 === '==') return 'EQUAL'
        if (q1 === '!=') return 'NOT_EQUAL'
        if (q1 === '<') return 'LESS_THAN'
        if (q1 === '<=') return 'LESS_THAN_OR_EQUAL'
        if (q1 === '>') return 'GREATER_THAN'
        if (q1 === '>=') return 'GREATER_THAN_OR_EQUAL'
        if (q1 === 'in') return 'IN'
        if (q1 === 'array-contains') return 'ARRAY_CONTAINS'
        throw new Error("UNKNOWN OPERATOR: " + q1)
    }

    toValue(q2) {
        // console.log("TO VALUE:", q2, typeof q2)
        if (q2 instanceof Date) return { timestampValue: q2 }
        if (typeof q2 === 'string') return { stringValue: q2 }
        if (typeof q2 === 'number') return { integerValue: q2 }
        if (typeof q2 === 'boolean') return { booleanValue: q2 }
        if (Array.isArray(q2)) return { arrayValue: q2 }
        if (typeof q2 === 'object') {
            if (q2.latitude && q2.longitude) return { geoPointValue: q2 }
            return { mapValue: q2 }
        }
        if (q2 === null) return { nullValue: null }
        if (typeof q2 == 'undefined') return { nullValue: null }
        if (q2 instanceof Date) return { timestampValue: q2 }
        console.log("UNKNOWN VALUE:", q2)
    }

    toDirection(d) {
        if (d === 'asc') return 'ASCENDING'
        if (d === 'desc') return 'DESCENDING'
        console.log("UNKNOWN DIRECTION:", d)
    }

    /* 
    https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery
    
    */
    async query(collection, q, opts = {}) {
        let url = `${this.apiURL}/:runQuery`
        let filters = []
        if (q.where) {
            for (const q2 of q.where) {
                filters.push({
                    fieldFilter: {
                        field: { fieldPath: q2[0] },
                        op: this.toOp(q2[1]),
                        value: this.toValue(q2[2]),
                    }
                })
            }
        }

        let body = {
            structuredQuery: {
                from: [{ collectionId: collection }],
                // where: {
                //     fieldFilter: {
                //         field: { fieldPath: 'isPublished' },
                //         op: 'EQUAL',
                //         value: { booleanValue: true }
                //     }
                // }
                where: {
                    compositeFilter: {
                        op: 'AND',
                        filters: filters,
                    }
                },
                limit: q.limit || this.options.maxLimit,
            }
        }
        if (q.orderBy) {
            body.structuredQuery.orderBy = [
                {
                    field: { fieldPath: q.orderBy[0] },
                    direction: this.toDirection(q.orderBy[1]),
                }
            ]
        }
        // console.log('QUERY BODY:', body)
        let json = await this.fetch(url, { ...opts, ...{ method: 'POST', body: body } })
        console.log("JSON:", json)
        let docs = []
        for (const d of json) {
            console.log("DOC:", d.name)
            if (!d.document) continue
            let doc = d.document
            let thing = { id: doc.name.split('/').pop() }
            this.fillFields(thing, doc)
            docs.push(thing)
        }
        return docs

    }

    async get(collection, id, opts = {}) {
        let url = `${this.apiURL}/${collection}`
        url += `/${id}`
        // console.log("URL:", url)
        let doc = await this.fetch(url, opts)
        let thing = { id: id }
        this.fillFields(thing, doc)
        return thing
    }

    async delete(collection, id, opts = {}) {
        let url = `${this.apiURL}/${collection}`
        url += `/${id}`
        // console.log("DELETE URL:", url)
        let r = await this.fetch(c, url, { ...opts, ...{ method: 'DELETE' } })
        // console.log(r)
    }


    async insert(collection, body, opts = {}) {
        let url = `${this.apiURL}/${collection}`
        let id = body.id || nanoid()
        url += `?documentId=${id}`
        // console.log("INSERT URL:", url)
        let now = new Date()
        if (!body.created_at) body.created_at = now
        if (!body.updated_at) body.updated_at = now
        let b2 = { fields: {} }
        for (const [key, value] of Object.entries(body)) {
            // console.log("INSERT FIELD:", key, value)
            b2.fields[key] = this.toValue(value)
            // console.log("B2:", b2.fields[key])
        }
        let r = await this.fetch(c, url, { ...opts, ...{ method: 'POST', body: b2 } })
        // console.log(r)
        body.id = id
        return body
    }
}
