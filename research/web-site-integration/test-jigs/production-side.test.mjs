import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GUIDANCE,
  createProvisioningToken,
  sampleProfile,
  startServiceFixture
} from './fixture.mjs'

let fixture

before(async () => {
  fixture = await startServiceFixture()
})

beforeEach(() => {
  fixture.users.clear()
})

after(async () => {
  await fixture.close()
})

async function wordpressLaunch(profile = sampleProfile) {
  const token = createProvisioningToken(profile)
  const response = await fetch(
    `${fixture.baseUrl}/api/integration/wordpress/provision`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ source: 'wordpress' })
    }
  )
  assert.equal(response.status, 200)
  return response.json()
}

describe('production-side WordPress launch flow', () => {
  it('launches an authenticated WordPress user into an authenticated carpool session', async () => {
    const { launch_code: launchCode } = await wordpressLaunch()
    const launch = await fetch(`${fixture.baseUrl}/launch?code=${launchCode}`, {
      redirect: 'manual'
    })
    const cookie = launch.headers.get('set-cookie')

    assert.equal(launch.status, 303)
    assert.equal(launch.headers.get('location'), '/carpool')
    assert.match(cookie, /^carpool_session=/)
    assert.match(cookie, /Secure/)

    const session = await fetch(`${fixture.baseUrl}/api/carpool/me`, {
      headers: { cookie: cookie.split(';', 1)[0] }
    })
    assert.equal(session.status, 200)
    assert.equal((await session.json()).user.sourceUid, sampleProfile.uid)
  })

  it('does not create a launch credential for an unauthenticated WordPress request', async () => {
    const response = await fetch(
      `${fixture.baseUrl}/api/integration/wordpress/provision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'wordpress', user: sampleProfile })
      }
    )

    assert.equal(response.status, 401)
    assert.equal(fixture.users.has(sampleProfile.uid), false)
  })

  it('shows the same safe guidance for missing and malformed launch codes', async () => {
    for (const path of ['/launch', '/launch?code=not-a-real-code']) {
      const response = await fetch(`${fixture.baseUrl}${path}`)
      assert.equal(response.status, 400)
      assert.match(await response.text(), new RegExp(GUIDANCE))
    }
  })
})
