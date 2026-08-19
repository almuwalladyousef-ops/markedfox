// Shared by the settings form (client) and the delete action (server). Lives
// apart from actions.ts because a "use server" module may only export async
// functions.
export const DELETE_CONFIRMATION_WORD = "DELETE";
