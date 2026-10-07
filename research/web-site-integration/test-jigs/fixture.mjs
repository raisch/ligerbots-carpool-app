import http from 'node:http'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

export const PROVISIONING_SECRET = 'test-only-provisioning-secret'
export const ISSUER = 'https://www.ligerbots.org'
export const AUDIENCE = 'carpool-provisioning'
export const GUIDANCE =
  'Please log into the Ligerbots web site first and click Resources/Carpools'

export const sampleProfile = {
  uid: 'wp-user-123',
  firstName: 'Joseph',
  lastName: 'User',
  email: 'juser@example.test',
  telephone: '+15551234567'
}

export function createProvisioningToken(
  profile = sampleProfile,
  options = {}
) {
  return jwt.sign(
    {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: profile.uid,
      user: {
        first_name: profile.firstName,
        last_name: profile.lastName,
        email: profile.email,
        telephone: profile.telephone
      }
    },
    PROVISIONING_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: options.expiresIn ?? 60,
      jwtid: options.jwtid ?? crypto.randomUUID(),
      ...(options.notBefore ? { notBefore: options.notBefore } : {})
    }
  )
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => {
      body += chunk
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

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

export async function startServiceFixture() {
  const users = new Map()
  const launchCodes = new Map()
  const sessions = new Map()
  const consumedJtis = new Set()

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'POST' &&
        request.url === '/api/integration/wordpress/provision') {
        const authorization = request.headers.authorization ?? ''
        if (!authorization.startsWith('Bearer ')) {
          sendJson(response, 401, { error: 'unauthorized' })
          return
        }

        let claims
        try {
          claims = jwt.verify(authorization.slice('Bearer '.length), PROVISIONING_SECRET, {
            algorithms: ['HS256'],
            issuer: ISSUER,
            audience: AUDIENCE
          })
        } catch {
          sendJson(response, 401, { error: 'unauthorized' })
          return
        }

        if (!claims.jti || consumedJtis.has(claims.jti)) {
          sendJson(response, 401, { error: 'unauthorized' })
          return
        }

        const profile = claims.user
        if (!claims.sub || !profile?.email || !profile.first_name || !profile.last_name) {
          sendJson(response, 400, { error: 'invalid profile' })
          return
        }

        await readJson(request)
        consumedJtis.add(claims.jti)
        users.set(claims.sub, {
          sourceSystem: 'wordpress',
          sourceUid: claims.sub,
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
          telephone: profile.telephone ?? null
        })

        const code = crypto.randomBytes(32).toString('base64url')
        launchCodes.set(code, { sourceUid: claims.sub, consumed: false })
        sendJson(response, 200, { launch_code: code, expires_in: 60 })
        return
      }

      if (request.method === 'GET' && request.url?.startsWith('/launch')) {
        const code = new URL(request.url, 'http://fixture').searchParams.get('code')
        const launch = code ? launchCodes.get(code) : undefined
        if (!launch || launch.consumed) {
          response.writeHead(400, { 'content-type': 'text/html' })
          response.end(`<p>${GUIDANCE}</p>`)
          return
        }

        launch.consumed = true
        const sessionId = crypto.randomBytes(24).toString('base64url')
        sessions.set(sessionId, launch.sourceUid)
        response.writeHead(303, {
          location: '/carpool',
          'set-cookie': `carpool_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/`
        })
        response.end()
        return
      }

      if (request.method === 'GET' && request.url === '/api/carpool/me') {
        const cookie = request.headers.cookie ?? ''
        const sessionId = cookie.match(/(?:^|;\s*)carpool_session=([^;]+)/)?.[1]
        const sourceUid = sessionId ? sessions.get(sessionId) : undefined
        if (!sourceUid || !users.has(sourceUid)) {
          sendJson(response, 401, { error: 'unauthorized' })
          return
        }
        sendJson(response, 200, { user: users.get(sourceUid) })
        return
      }

      sendJson(response, 404, { error: 'not found' })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'fixture error' })
    }
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    baseUrl,
    users,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
}

