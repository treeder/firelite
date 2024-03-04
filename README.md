# firelite

Simple, lightweight firebase libraries using the REST APIs instead of grpc based ones. 

## Usage

```sh
npm install treeder/firelite
```

Initialize them with you google credentials JSON:

```
let firestore = new Firestore({creds: creds})
let storage = new Storage({creds: creds})
let logging = new Logging({creds: creds})
```
