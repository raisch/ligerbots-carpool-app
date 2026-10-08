import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import jwt from 'jsonwebtoken'

const port = Number(process.env.PORT ?? 3000)
const issuer = process.env.WORDPRESS_ISSUER ?? 'https://www.ligerbots.org'
const audience = process.env.WORDPRESS_AUDIENCE ?? 'carpool-provisioning'
const keyId = process.env.WORDPRESS_KEY_ID ?? 'wordpress-development'
const publicKeyPath = process.env.WORDPRESS_PUBLIC_KEY_PATH ?? '/run/keys/wordpress-public.pem'
const launchPath = process.env.CARPOOL_LAUNCH_PATH ?? '/launch'
const appPath = process.env.CARPOOL_APP_PATH ?? '/carpool'
const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE === 'true'
const logProfileData = process.env.LOG_PROFILE_DATA === 'true'
const launchTtlMs = 60_000

if (!fs.existsSync(publicKeyPath)) {
  throw new Error(`Missing WordPress public key: ${publicKeyPath}`)
}

const publicKey = fs.readFileSync(publicKeyPath, 'utf8')
const users = new Map()
const consumedJtis = new Set()
const launchCodes = new Map()
const sessions = new Map()

function logRequest(request, response, path, requestId, startedAt) {
  response.on('finish', () => {
    console.log(JSON.stringify({
      event: 'http_request',
      request_id: requestId,
      correlation_id: typeof request.headers['x-correlation-id'] === 'string'
        ? request.headers['x-correlation-id']
        : null,
      method: request.method,
      path,
      status: response.statusCode,
      duration_ms: Date.now() - startedAt
    }))
  })
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function guidance(response) {
  response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
  response.end('<p>Please log into the Ligerbots web site https://www.ligerbots.org first and click Resources/Carpools on the menu.</p>')
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => {
      body += chunk
      if (body.length > 16_384) reject(new Error('request body too large'))
    })
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function validProfile(claims) {
  const user = claims.user
  return typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    claims.sub.length <= 128 &&
    user &&
    typeof user.first_name === 'string' &&
    user.first_name.length > 0 &&
    user.first_name.length <= 100 &&
    typeof user.last_name === 'string' &&
    user.last_name.length > 0 &&
    user.last_name.length <= 100 &&
    typeof user.email === 'string' &&
    user.email.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) &&
    (user.telephone === undefined || (
      typeof user.telephone === 'string' && user.telephone.length <= 40
    ))
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function bearerToken(request) {
  const value = request.headers.authorization ?? ''
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length) : null
}

function verifyProvisioningToken(token) {
  const decoded = jwt.decode(token, { complete: true })
  if (!decoded || typeof decoded !== 'object' || decoded.header?.kid !== keyId) {
    throw new Error('invalid key id')
  }

  const claims = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer,
    audience,
    clockTolerance: 5
  })

  if (typeof claims !== 'object' || !claims.jti || consumedJtis.has(claims.jti) || !validProfile(claims)) {
    throw new Error('invalid provisioning claims')
  }

  return claims
}

function createLaunchCode(sourceUid) {
  const code = crypto.randomBytes(32).toString('base64url')
  launchCodes.set(hash(code), {
    sourceUid,
    expiresAt: Date.now() + launchTtlMs,
    consumed: false
  })
  return code
}

function sessionUser(request) {
  const cookie = request.headers.cookie ?? ''
  const sessionId = cookie.match(/(?:^|;\s*)carpool_session=([^;]+)/)?.[1]
  const sourceUid = sessionId ? sessions.get(sessionId) : undefined
  return sourceUid ? users.get(sourceUid) : undefined
}

const server = http.createServer(async (request, response) => {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()
  response.setHeader('X-Request-ID', requestId)

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    logRequest(request, response, url.pathname, requestId, startedAt)

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/integration/wordpress/provision') {
      const token = bearerToken(request)
      if (!token) {
        sendJson(response, 401, { error: 'unauthorized' })
        return
      }

      let claims
      try {
        claims = verifyProvisioningToken(token)
        await readJson(request)
      } catch {
        sendJson(response, 401, { error: 'unauthorized' })
        return
      }

      consumedJtis.add(claims.jti)
      users.set(claims.sub, {
        sourceSystem: 'wordpress',
        sourceUid: claims.sub,
        firstName: claims.user.first_name,
        lastName: claims.user.last_name,
        email: claims.user.email,
        telephone: claims.user.telephone ?? null,
        updatedAt: new Date().toISOString()
      })

      if (logProfileData) {
        console.log(JSON.stringify({
          event: 'user_provisioned',
          request_id: requestId,
          correlation_id: typeof request.headers['x-correlation-id'] === 'string'
            ? request.headers['x-correlation-id']
            : null,
          source_system: 'wordpress',
          source_uid: claims.sub,
          first_name: claims.user.first_name,
          last_name: claims.user.last_name,
          email: claims.user.email,
          telephone: claims.user.telephone ?? null
        }))
      }

      sendJson(response, 200, {
        launch_code: createLaunchCode(claims.sub),
        expires_in: launchTtlMs / 1000
      })
      return
    }

    if (request.method === 'GET' && url.pathname === launchPath) {
      const code = url.searchParams.get('code')
      const record = code ? launchCodes.get(hash(code)) : undefined
      if (!record || record.consumed || record.expiresAt <= Date.now()) {
        guidance(response)
        return
      }

      record.consumed = true
      const sessionId = crypto.randomBytes(32).toString('base64url')
      sessions.set(sessionId, record.sourceUid)
      response.writeHead(303, {
        location: appPath,
        'set-cookie': `carpool_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/${sessionCookieSecure ? '; Secure' : ''}`
      })
      response.end()
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/carpool/me') {
      const user = sessionUser(request)
      if (!user) {
        sendJson(response, 401, { error: 'unauthorized' })
        return
      }
      sendJson(response, 200, { user })
      return
    }

    if (request.method === 'GET' && url.pathname === appPath) {
      if (!sessionUser(request)) {
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' })
        response.end('<p>Carpool session required</p>')
        return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<h1>LigerBots Carpool</h1>')
      return
    }

    sendJson(response, 404, { error: 'not found' })
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'internal error' })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Carpool auth simulator listening on port ${port}`)
})
