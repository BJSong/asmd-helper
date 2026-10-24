import { clearFamilySession } from '../utils/cloud'

export default defineEventHandler(event=>{
  clearFamilySession(event)
  setHeader(event,'Cache-Control','no-store')
  return {ok:true}
})
