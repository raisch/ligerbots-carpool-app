import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUDIENCE,
  GUIDANCE,
  ISSUER,
  PROVISIONING_SECRET,
  createProvisioningToken,
  sampleProfile,
  startServiceFixture
} from './fixture.mjs'
import jwt from 'jsonwebtoken'

let fixture

before(async () => {
  fixture = await startServiceFixture()
})

after(async () => {
  await fixture.close()
})

async function provision(token, body = {}) {
  return fetch(`${fixture.baseUrl}/api/integration/wordpress/provision`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

describe('service-side provisioning boundary', () => {
  it('upserts one Directus-style user and returns a launch code', async () => {
    const response = await provision(createProvisioningToken(sampleProfile), {
      source: 'wordpress'
    })
    const result = await response.json()

    assert.equal(response.status, 200)
    assert.ok(result.launch_code)
    assert.equal(fixture.users.size, 1)
    assert.deepEqual(fixture.users.get(sampleProfile.uid), {
      sourceSystem: 'wordpress',
      sourceUid: sampleProfile.uid,
      firstName: sampleProfile.firstName,
      lastName: sampleProfile.lastName,
      email: sampleProfile.email,
      telephone: sampleProfile.telephone
    })
  })

  it('rejects missing, forged, expired, and wrong-audience credentials', async () => {
    const missing = await fetch(`${fixture.baseUrl}/api/integration/wordpress/provision`, {
      method: 'POST'
    })
    assert.equal(missing.status, 401)

    const forged = await provision(jwt.sign({ sub: sampleProfile.uid }, 'wrong-secret'))
    assert.equal(forged.status, 401)

    const expired = await provision(createProvisioningToken(sampleProfile, { expiresIn: -1 }))
    assert.equal(expired.status, 401)

    const wrongAudience = jwt.sign(
      { iss: ISSUER, aud: 'wrong-audience', sub: sampleProfile.uid, user: {} },
      PROVISIONING_SECRET,
      { algorithm: 'HS256', expiresIn: 60 }
    )
    const wrongAudienceResponse = await provision(wrongAudience)
    assert.equal(wrongAudienceResponse.status, 401)
  })

  it('rejects a replayed jti and permits only one launch-code exchange', async () => {
    const token = createProvisioningToken(sampleProfile, { jwtid: 'replay-once' })
    const firstProvision = await provision(token)
    const firstResult = await firstProvision.json()
    assert.equal((await provision(token)).status, 401)

    const launch = await fetch(`${fixture.baseUrl}/launch?code=${firstResult.launch_code}`, {
      redirect: 'manual'
    })
    assert.equal(launch.status, 303)
    assert.match(launch.headers.get('set-cookie'), /HttpOnly/)

    const replay = await fetch(`${fixture.baseUrl}/launch?code=${firstResult.launch_code}`)
    assert.equal(replay.status, 400)
    assert.match(await replay.text(), new RegExp(GUIDANCE))
  })
})

