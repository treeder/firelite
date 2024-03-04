import { verifyIdToken, getAccessToken } from "web-auth-library/google"
import { APIError } from "api";

export class Storage {

    constructor(options = {}) {
        this.options = options
        this.apiURL = `https://storage.googleapis.com/storage/v1/b`

    }

    async fetch(url, opts = {}) {
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

    async bucket(bucketName, opts = {}) {
        if (!bucketName) bucketName = this.options.bucketName
        let b = await this.fetch(`${this.apiURL}/${bucketName}`)
        b.object = async (objectName, opts) => {
            return await this.object(bucketName, objectName, opts)
        }
        b.post = async (objectName, file, opts) => {
            let url = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${objectName}`
            let opts = {
                method: "POST",
                body: await file.stream(),
                headers: {
                    "Content-Type": file.type,
                    "Content-Length": file.size,
                }
            }
            return await this.fetch(url, opts)
        }
        // generateV4GetObjectSignedURL generates object signed URL with GET method.
        // more: https://medium.com/google-cloud/bypass-the-cloud-run-32mb-limit-with-cloud-storage-65c24156189
        b.signedURL = async (objectName, contentType, opts) => {
            // Signing a URL requires credentials authorized to sign a URL. You can pass
            // these in through SignedURLOptions with one of the following options:
            //    a. a Google service account private key, obtainable from the Google Developers Console
            //    b. a Google Access ID with iam.serviceAccounts.signBlob permissions
            //    c. a SignBytes function implementing custom signing.
            // In this example, none of these options are used, which means the SignedURL
            // function attempts to use the same authentication that was used to instantiate
            // the Storage client. This authentication must include a private key or have
            // iam.serviceAccounts.signBlob permissions.
            let url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${objectName}/generateSignedUrl`
            let signedURLOptions = {
                // scheme: storage.SigningSchemeV4,
                method: "PUT",
                // ContentType: fileType,
                headers: {
                    "Content-Type": contentType,
                },
                // Headers: []string{
                // 	// "Content-Type:application/octet-stream",
                // 	"Content-Type:multipart/form-data",
                // },
                expires: new Date((new Date().getTime()) + 15 * 60 * 1000) // 15 minutes
            }
            return await this.fetch(c, url, opts)
        }
        return b
    }

    async object(bucketName, objectName) {
        if (!bucketName) bucketName = this.options.bucketName
        return await this.fetch(c, `${this.apiURL}/${bucketName}/o/${objectName}`)
    }
}