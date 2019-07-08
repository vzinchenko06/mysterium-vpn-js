/* eslint-disable @typescript-eslint/camelcase */
/*
 * Copyright (C) 2017 The "mysteriumnetwork/mysterium-vpn-js" Authors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { AxiosAdapter } from './http/axios-adapter'
import { TequilapiClient, HttpTequilapiClient } from './tequilapi-client'
import { parseConsumerLocation } from './consumer/location'
import { parseIdentity } from './identity/identity'
import { parseHealthcheckResponse } from './daemon/healthcheck'
import { parseProposal } from './proposal/proposal'
import { parseServiceInfo, parseServiceInfoList } from './provider/service-info'

describe('HttpTequilapiClient', () => {
  let api: TequilapiClient
  let mock: MockAdapter

  beforeEach(() => {
    const axioInstance = axios.create()
    api = new HttpTequilapiClient(new AxiosAdapter(axioInstance))
    mock = new MockAdapter(axioInstance)
  })

  describe('healthcheck()', () => {
    it('returns response', async () => {
      const buildInfo = {
        commit: '0bcccc',
        branch: 'master',
        buildNumber: '001',
      }
      const response = {
        uptime: '1h10m',
        process: 1111,
        version: '0.0.6',
        buildInfo,
      }
      mock.onGet('healthcheck').reply(200, response)

      const healthcheck = await api.healthCheck()
      expect(healthcheck).toEqual(parseHealthcheckResponse(response))
      expect(healthcheck.version).toEqual('0.0.6')
      expect(healthcheck.buildInfo).toEqual(buildInfo)
    })

    it('throws error with unexpected response body', () => {
      const response = {
        uptime: '1h10m',
        process: 1111,
        version: {
          commit: '0bcccc',
          branch: 'master',
          buildNumber: '001',
        },
      }
      mock.onGet('healthcheck').reply(200, response)

      expect(api.healthCheck()).rejects.toEqual(
        new Error(
          'Unable to parse healthcheck response: ' +
            '{"uptime":"1h10m","process":1111,"version":{"commit":"0bcccc","branch":"master","buildNumber":"001"}}'
        )
      )
    })

    it('handles error', () => {
      mock.onGet('/healthcheck').reply(500)

      expect(api.healthCheck()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="healthcheck")'
      )
    })
  })

  describe('natStatus()', () => {
    it('returns successful response', async () => {
      const response = {
        status: 'success',
      }
      mock.onGet('nat/status').reply(200, response)

      const status = await api.natStatus()
      expect(status.status).toEqual('success')
      expect(status.error).toBeUndefined()
    })

    it('returns failure response with error', async () => {
      const response = {
        status: 'failure',
        error: 'mock error',
      }
      mock.onGet('nat/status').reply(200, response)

      const status = await api.natStatus()
      expect(status.status).toEqual('failure')
      expect(status.error).toEqual('mock error')
    })

    it('returns error when status is missing', async () => {
      const response = {}
      mock.onGet('nat/status').reply(200, response)

      expect(api.natStatus()).rejects.toHaveProperty(
        'message',
        'NatStatusResponse: status is not provided'
      )
    })

    it('returns error when error has wrong type', async () => {
      const response = {
        status: 'failure',
        error: 5,
      }
      mock.onGet('nat/status').reply(200, response)

      expect(api.natStatus()).rejects.toHaveProperty(
        'message',
        'NatStatusResponse: error should be "string"'
      )
    })
  })

  describe('stop()', () => {
    it('success', async () => {
      const expectedRequest = undefined
      mock.onPost('stop', expectedRequest).reply(200)

      const response = await api.stop()
      expect(response).toBeUndefined()
    })

    it('handles error', () => {
      mock.onPost('stop').reply(500)

      expect(api.stop()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="stop")'
      )
    })
  })

  describe('location()', () => {
    it('returns response', async () => {
      const response = {
        ip: '0.0.0.0',
        asn: 8764,
        isp: 'Telia Lietuva, AB',
        continent: 'EU',
        country: 'LT',
        city: 'Vilnius',
        node_type: 'residential',
      }

      mock.onGet('location').reply(200, response)

      const stats = await api.location()

      const dto = parseConsumerLocation(response)
      expect(stats.ip).toEqual(dto.ip)
      expect(stats.asn).toEqual(dto.asn)
      expect(stats.isp).toEqual(dto.isp)
      expect(stats.continent).toEqual(dto.continent)
      expect(stats.country).toEqual(dto.country)
      expect(stats.city).toEqual(dto.city)
      expect(stats.node_type).toEqual(dto.node_type)
      expect(stats).toEqual(dto)
    })

    it('handles error', () => {
      mock.onGet('location').reply(500)

      expect(api.location()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="location")'
      )
    })
  })

  describe('findProposals()', () => {
    it('returns proposal DTOs', async () => {
      const response = {
        proposals: [
          {
            id: 1,
            providerId: '0x0',
            serviceType: 'openvpn',
            serviceDefinition: {
              locationOriginate: {
                asn: '',
                country: 'NL',
              },
            },
          },
          {
            id: 1,
            providerId: '0x1',
            serviceType: 'openvpn',
            serviceDefinition: {
              locationOriginate: {
                asn: '',
                country: 'LT',
              },
            },
          },
        ],
      }
      mock.onGet('proposals').reply(200, response)

      const proposals = await api.findProposals()
      expect(proposals).toHaveLength(2)
      expect(proposals[0]).toEqual(parseProposal(response.proposals[0]))
      expect(proposals[1]).toEqual(parseProposal(response.proposals[1]))
    })

    it('fetches connect counts when option is given', async () => {
      const response = {
        proposals: [
          {
            id: 1,
            providerId: '0x0',
            serviceType: 'openvpn',
            serviceDefinition: {
              locationOriginate: {
                asn: '',
                country: 'NL',
              },
            },
            metrics: {
              connectCount: {
                success: 1,
                fail: 1,
                ping: 1,
              },
            },
          },
        ],
      }
      mock.onGet('proposals', { params: { fetchConnectCounts: true } }).reply(200, response)
      const proposals = await api.findProposals({ fetchConnectCounts: true })
      expect(proposals).toHaveLength(1)
    })

    it('handles error', () => {
      mock.onGet('proposals').reply(500)

      expect(api.findProposals()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="proposals")'
      )
    })
  })

  describe('identityList()', () => {
    it('returns identity DTOs', async () => {
      const response = {
        identities: [{ id: '0x1000FACE' }, { id: '0x2000FACE' }],
      }
      mock.onGet('identities').reply(200, response)

      const identities = await api.identityList()
      expect(identities).toHaveLength(2)
      expect(identities[0]).toEqual(parseIdentity(response.identities[0]))
      expect(identities[1]).toEqual(parseIdentity(response.identities[1]))
    })

    it('handles error', () => {
      mock.onGet('identities').reply(500)

      expect(api.identityList()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="identities")'
      )
    })
  })

  describe('identityCurrent()', () => {
    it('returns current identity DTO', async () => {
      const response = { id: '0x0000bEEF' }
      mock.onPut('identities/current', { passphrase: 'test' }).reply(200, response)

      const identity = await api.identityCurrent('test')
      expect(identity).toEqual(parseIdentity(response))
    })

    it('handles error', () => {
      mock.onPut('identities/current').reply(500)

      expect(api.identityCurrent('test')).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="identities/current")'
      )
    })
  })

  describe('identityCreate()', () => {
    it('create identity', async () => {
      const response = { id: '0x0000bEEF' }
      mock.onPost('identities', { passphrase: 'test' }).reply(200, response)

      const identity = await api.identityCreate('test')
      expect(identity).toEqual(parseIdentity(response))
    })

    it('handles error', () => {
      mock.onPost('identities').reply(500)

      expect(api.identityCreate('test')).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="identities")'
      )
    })
  })

  describe('identityUnlock()', () => {
    it('creates identity', async () => {
      mock.onPut('identities/0x0000bEEF/unlock', { passphrase: 'test' }).reply(200)

      await api.identityUnlock('0x0000bEEF', 'test')
    })

    it('allows specifying custom timeout', async () => {
      mock.onPut('identities/0x0000bEEF/unlock', { passphrase: 'test' }).reply(200)

      await api.identityUnlock('0x0000bEEF', 'test', 10000)
    })

    it('handles error', () => {
      mock.onPut('identities/0x0000bEEF/unlock').reply(500)

      expect(api.identityUnlock('0x0000bEEF', 'test')).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="identities/0x0000bEEF/unlock")'
      )
    })
  })

  describe('identityRegistration()', () => {
    it('returns response', async () => {
      const response = {
        registered: false,
        publicKey: {
          part1: '0xfb22c62ed2ddc65eb2994a8af5b1094b239aacc04a6505fd2bc581f55547175a',
          part2: '0xef3156a0d95c3832b191c03c272a5900e3e30484b9c8a65a0387f1f8d436867f',
        },
        signature: {
          r: '0xb48616d33aba008f687d500cac9e9f2ca2b3c275fab6fc21318b81e09571d993',
          s: '0x49c0d7e1445389dbc805275f0aeb0b7f23e50e26a772b5a3bc4b2cc39f1bb3aa',
          v: 28,
        },
      }
      mock.onGet('identities/0x0000bEEF/registration').reply(200, response)

      const registration = await api.identityRegistration('0x0000bEEF')
      expect(registration).toEqual(response)
    })

    it('handles error', () => {
      mock.onGet('identities/0x0000bEEF/registration').reply(500)

      expect(api.identityRegistration('0x0000bEEF')).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="identities/0x0000bEEF/registration")'
      )
    })
  })

  describe('identityPayout()', () => {
    it('returns identity payout info', async () => {
      const response = {
        ethAddress: '0xaef57945ebd1c2e4dfc8e18b8ec6ab593ae0dbca',
        referralCode: 'ABC1234',
      }
      mock.onGet('identities/test-id/payout').reply(200, response)
      const info = await api.identityPayout('test-id')
      expect(info).toEqual({
        ethAddress: '0xaef57945ebd1c2e4dfc8e18b8ec6ab593ae0dbca',
        referralCode: 'ABC1234',
      })
    })

    it('returns error when api does not return body', async () => {
      mock.onGet('identities/test-id/payout').reply(200)
      expect(api.identityPayout('test-id')).rejects.toHaveProperty(
        'message',
        'Identity payout response body is missing'
      )
    })

    it('returns error when eth address is missing', async () => {
      mock.onGet('identities/test-id/payout').reply(200, { referralCode: 'test' })
      expect(api.identityPayout('test-id')).rejects.toHaveProperty(
        'message',
        'IdentityPayout: ethAddress is not provided'
      )
    })

    it('returns error when referral code is missing', async () => {
      mock.onGet('identities/test-id/payout').reply(200, { ethAddress: '0x0' })
      expect(api.identityPayout('test-id')).rejects.toHaveProperty(
        'message',
        'IdentityPayout: referralCode is not provided'
      )
    })
  })

  describe('updateIdentityPayout()', () => {
    it('succeeds', async () => {
      mock.onPut('identities/test-id/payout', { ethAddress: 'my eth address' }).reply(200)
      await api.updateIdentityPayout('test-id', 'my eth address')
    })
  })

  describe('updateReferralCode()', () => {
    it('succeeds', async () => {
      mock.onPut('identities/test-id/referral', { referralCode: 'ABC1234' }).reply(200)
      await api.updateReferralCode('test-id', 'ABC1234')
    })
  })

  describe('connectionCreate()', () => {
    it('returns response', async () => {
      const expectedRequest = {
        consumerId: '0x1000FACE',
        providerId: '0x2000FACE',
        serviceType: 'openvpn',
      }
      const response = {
        status: 'Connected',
        sessionId: 'My-super-session',
      }
      mock.onPut('connection', expectedRequest).reply(200, response)

      const request = { consumerId: '0x1000FACE', providerId: '0x2000FACE', serviceType: 'openvpn' }
      const stats = await api.connectionCreate(request)
      expect(stats).toEqual(response)
    })

    it('handles error', () => {
      mock.onPut('connection').reply(500)
      const request = { consumerId: '0x1000FACE', providerId: '0x2000FACE', serviceType: 'openvpn' }
      expect(api.connectionCreate(request)).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="connection")'
      )
    })
  })

  describe('connectionStatus()', () => {
    it('returns response', async () => {
      const response = {
        status: 'Connected',
        sessionId: 'My-super-session',
      }
      mock.onGet('connection').reply(200, response)

      const connection = await api.connectionStatus()
      expect(connection).toEqual(response)
    })

    it('handles error', () => {
      mock.onGet('connection').reply(500)

      expect(api.connectionStatus()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="connection")'
      )
    })
  })

  describe('connectionCancel()', () => {
    it('succeeds', async () => {
      mock.onDelete('connection').reply(200)

      await api.connectionCancel()
    })

    it('handles error', () => {
      mock.onDelete('connection').reply(500)

      expect(api.connectionCancel()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="connection")'
      )
    })
  })

  describe('connectionIp()', () => {
    it('returns response', async () => {
      const response = { ip: 'mock ip' }
      mock.onGet('connection/ip').reply(200, response)

      const stats = await api.connectionIp()
      expect(stats).toEqual(response)
    })

    it('handles error', () => {
      mock.onGet('connection/ip').reply(500)

      expect(api.connectionIp()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="connection/ip")'
      )
    })
  })

  describe('connectionStatistics()', () => {
    it('returns response', async () => {
      const response = {
        duration: 13325,
        bytesReceived: 1232133, // 1.17505 MB
        bytesSent: 123321, // 0.117608 MB
      }
      mock.onGet('connection/statistics').reply(200, response)

      const stats = await api.connectionStatistics()
      expect(stats).toEqual(response)
    })

    it('handles error', () => {
      mock.onGet('connection/statistics').reply(500)

      expect(api.connectionStatistics()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="connection/statistics")'
      )
    })
  })

  describe('connectionSessions()', () => {
    it('returns response', async () => {
      const response = {
        sessions: [
          {
            sessionId: '30f610a0-c096-11e8-b371-ebde26989839',
            providerId: '0x3b03a513fba4bd4868edd340f77da0c920150f3e',
            providerCountry: 'lt',
            dateStarted: '2019-02-14T11:04:15Z',
            duration: 35 * 60,
            bytesSent: 1024,
            bytesReceived: 6000,
          },
          {
            sessionId: '76fca3dc-28d0-4f00-b06e-a7d6050699ae',
            providerId: '0x1b03b513fba4bd4868edd340f77da0c920150f0a',
            providerCountry: 'us',
            dateStarted: '2019-02-14T11:04:15Z',
            duration: 35 * 60,
            bytesSent: 1024,
            bytesReceived: 6000,
          },
        ],
      }
      mock.onGet('connection-sessions').reply(200, response)

      const sessions = await api.connectionSessions()
      expect(sessions).toHaveLength(2)
      expect(sessions[0].sessionId).toEqual('30f610a0-c096-11e8-b371-ebde26989839')
    })

    it('handles error', () => {
      mock.onGet('connection-sessions').reply(500)

      expect(api.connectionSessions()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="connection-sessions")'
      )
    })
  })

  const serviceObject = {
    id: 'service1',
    providerId: '0x1',
    type: 'openvpn',
    options: {},
    status: 'Starting',
    proposal: {
      id: 1,
      providerId: '0x1',
      serviceType: 'openvpn',
      serviceDefinition: {
        locationOriginate: {
          country: 'NL',
        },
      },
    },
  }
  describe('serviceList()', () => {
    it('returns response', async () => {
      const response = [serviceObject]
      mock.onGet('services').reply(200, response)

      const services = await api.serviceList()
      expect(services).toEqual(parseServiceInfoList(response))
    })

    it('handles error', () => {
      mock.onGet('services').reply(500)

      expect(api.serviceList()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="services")'
      )
    })
  })

  describe('serviceGet()', () => {
    it('returns response', async () => {
      mock.onGet('services/service1').reply(200, serviceObject)

      const service = await api.serviceGet('service1')
      expect(service).toEqual(parseServiceInfo(serviceObject))
    })

    it('handles error', () => {
      mock.onGet('services/service1').reply(500)

      expect(api.serviceGet('service1')).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="services/service1")'
      )
    })
  })

  describe('serviceStart()', () => {
    it('returns response', async () => {
      const expectedRequest = {
        providerId: '0x2000FACE',
        type: 'openvpn',
        accessPolicies: {
          ids: ['mysterium-verified'],
        },
      }
      mock.onPost('services', expectedRequest).reply(200, serviceObject)

      const request = {
        providerId: '0x2000FACE',
        type: 'openvpn',
        accessPolicies: { ids: ['mysterium-verified'] },
      }
      const response = await api.serviceStart(request)
      expect(response).toEqual(serviceObject)
    })

    it('handles error', () => {
      mock.onPost('services').reply(500)

      const request = { providerId: '0x2000FACE', type: 'openvpn' }
      expect(api.serviceStart(request)).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="services")'
      )
    })
  })

  describe('serviceStop()', () => {
    it('succeeds', async () => {
      const expectedRequest = undefined
      mock.onDelete('services/service1', expectedRequest).reply(202)

      await api.serviceStop('service1')
    })

    it('handles error', () => {
      mock.onDelete('services/service1').reply(500)

      expect(api.serviceStop('service1')).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="services/service1")'
      )
    })
  })

  describe('serviceSessions()', () => {
    it('returns response', async () => {
      const response = {
        sessions: [
          {
            id: '30f610a0-c096-11e8-b371-ebde26989839',
            consumerId: '0x1000FACE',
            createdAt: '2019-01-01 00:00:00',
            bytesIn: 1000,
            bytesOut: 100,
          },
          {
            id: '76fca3dc-28d0-4f00-b06e-a7d6050699ae',
            consumerId: '0x2000FACE',
            createdAt: '2019-01-02 00:00:00',
            bytesIn: 1100,
            bytesOut: 101,
          },
        ],
      }
      mock.onGet('service-sessions').reply(200, response)

      const sessions = await api.serviceSessions()
      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toEqual('30f610a0-c096-11e8-b371-ebde26989839')
    })

    it('handles error', () => {
      mock.onGet('service-sessions').reply(500)

      expect(api.serviceSessions()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="service-sessions")'
      )
    })
  })

  describe('accessPolicies()', () => {
    it('returns response', async () => {
      const response = {
        entries: [
          {
            id: 'mysterium',
            title: 'mysterium verified',
            description: 'Mysterium Network approved identities',
            allow: [
              {
                type: 'identity',
                value: '0x123',
              },
            ],
          },
          {
            id: 'mysterium #2',
            title: 'mysterium verified #2',
            description: 'Mysterium Network approved identities #2',
            allow: [
              {
                type: 'identity',
                value: '0x123',
              },
            ],
          },
        ],
      }

      mock.onGet('access-policies').reply(200, response)

      const sessions = await api.accessPolicies()
      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toEqual('mysterium')
    })

    it('handles error', () => {
      mock.onGet('access-policies').reply(500)

      expect(api.accessPolicies()).rejects.toHaveProperty(
        'message',
        'Request failed with status code 500 (path="access-policies")'
      )
    })
  })
})
