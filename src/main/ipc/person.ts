import {
  updatePersonPhoto,
  deletePersonPhoto,
  getPersonPhoto,
  getManyPersonPhotos
} from '../application/person-photo'
import {
  updatePersonPhotoInputSchema,
  deletePersonPhotoInputSchema,
  getPersonPhotoInputSchema,
  getManyPersonPhotosInputSchema
} from '../../shared/contracts/person-photo'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerPersonPhotoIpc(): void {
  handle(IPC_CHANNELS.PERSON_PHOTO_UPDATE, updatePersonPhotoInputSchema, (input) =>
    updatePersonPhoto(input)
  )
  handle(IPC_CHANNELS.PERSON_PHOTO_DELETE, deletePersonPhotoInputSchema, (input) =>
    deletePersonPhoto(input)
  )
  handle(IPC_CHANNELS.PERSON_PHOTO_GET, getPersonPhotoInputSchema, (input) =>
    getPersonPhoto(input)
  )
  handle(IPC_CHANNELS.PERSON_PHOTO_GET_MANY, getManyPersonPhotosInputSchema, (input) =>
    getManyPersonPhotos(input)
  )
}
