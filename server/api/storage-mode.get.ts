import { cloudStorageMode } from '../utils/cloud'

export default defineEventHandler(event=>{
  setHeader(event,'Cache-Control','no-store')
  return {mode:cloudStorageMode(event)}
})
