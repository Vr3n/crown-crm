import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { create, windowScheduler, indexedResolver } from '@yornaath/batshit'
import { toast } from 'sonner'
import type {
  UpdatePersonPhotoInput,
  DeletePersonPhotoInput,
  PersonPhotoOutput
} from '../../../../shared/contracts/person-photo'

/**
 * Person-photo hooks. Photo belongs to Person (not Lead or Customer), so a
 * single query-key namespace is shared across features.
 *
 * Uses `batshit` to batch per-person `usePersonPhoto` calls rendered by many
 * table rows into a single `person.photo:getMany` IPC call within a 10ms window.
 */

/* -------------------------------------------------------------------------- */
/* Query key factory                                                           */
/* -------------------------------------------------------------------------- */

export const personPhotoKeys = {
  all: ['person-photo'] as const,
  photo: (personId: number) => [...personPhotoKeys.all, personId] as const
}

/* -------------------------------------------------------------------------- */
/* Windowed batcher (module-level singleton)                                    */
/* -------------------------------------------------------------------------- */

type PhotoBatchResponse = Record<number, string | null>

const photoBatcher = create<PhotoBatchResponse, number, string | null>({
  fetcher: async (ids) => {
    const res = await window.api.person.getPhotos({ personIds: ids })
    return res.photos
  },
  resolver: indexedResolver<PhotoBatchResponse, number>(),
  scheduler: windowScheduler(10),
  name: 'person-photos'
})

/* -------------------------------------------------------------------------- */
/* Query hook                                                                  */
/* -------------------------------------------------------------------------- */

export function usePersonPhoto(
  personId: number | undefined
): UseQueryResult<PersonPhotoOutput, Error> {
  return useQuery({
    queryKey: personPhotoKeys.photo(personId ?? 0),
    queryFn: async () => {
      const photoData = await photoBatcher.fetch(personId!)
      return {
        personId: personId!,
        photoFilename: null,
        photoPath: null,
        photoData: photoData ?? null
      } satisfies PersonPhotoOutput
    },
    enabled: personId !== undefined && personId > 0,
    staleTime: 5 * 60_000
  })
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                              */
/* -------------------------------------------------------------------------- */

export function useUpdatePersonPhoto(): UseMutationResult<
  PersonPhotoOutput,
  Error,
  UpdatePersonPhotoInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.person.updatePhoto(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: personPhotoKeys.photo(variables.personId) })
      toast.success('Photo updated')
    },
    onError: () => toast.error('Could not update photo')
  })
}

export function useDeletePersonPhoto(): UseMutationResult<void, Error, DeletePersonPhotoInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.person.deletePhoto(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: personPhotoKeys.photo(variables.personId) })
      toast.success('Photo removed')
    },
    onError: () => toast.error('Could not remove photo')
  })
}
