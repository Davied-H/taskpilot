import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { useAppStore } from '../stores/appStore'
import { getProjects, getAllTasks, getMeetings } from './useWails'

/**
 * Subscribes to backend events for cross-window state synchronization.
 * Each window runs its own JS runtime, so we listen to Go-emitted events
 * and refresh the Zustand store accordingly.
 */
export function useWailsEvents() {
  const { setProjects, setTasks, setMeetings } = useAppStore()

  useEffect(() => {
    const unsubProject = Events.On('project:changed', async () => {
      const projects = await getProjects()
      setProjects(projects || [])
    })

    const unsubTask = Events.On('task:changed', async () => {
      const tasks = await getAllTasks()
      setTasks(tasks || [])
    })

    const unsubTags = Events.On('task:tags:updated', async () => {
      const tasks = await getAllTasks()
      setTasks(tasks || [])
    })

    const unsubMeeting = Events.On('meeting:changed', async () => {
      const meetings = await getMeetings()
      setMeetings(meetings || [])
    })

    return () => {
      if (unsubProject) unsubProject()
      if (unsubTask) unsubTask()
      if (unsubTags) unsubTags()
      if (unsubMeeting) unsubMeeting()
    }
  }, [setProjects, setTasks, setMeetings])
}
