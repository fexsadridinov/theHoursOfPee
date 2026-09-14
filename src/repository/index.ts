import { isRemoteConfigured } from '../config'
import { LocalRepository } from './local'
import { RemoteRepository } from './remote'
import type { DataRepository } from './types'

export const createRepository = (force: 'local' | 'remote' | 'auto' = 'auto'): DataRepository => {
  if (force === 'local' || (force === 'auto' && !isRemoteConfigured())) return new LocalRepository()
  return new RemoteRepository()
}

export type { DataRepository, SaveStatus } from './types'
export { LocalRepository } from './local'
export { RemoteRepository } from './remote'
export { SessionExpiredError } from './types'
