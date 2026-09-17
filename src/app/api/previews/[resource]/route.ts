import { requestSession, consumeLimit } from '@/server/auth';
import { requestContext } from '@/server/audit';
import { ApiError, errorResponse, json } from '@/server/http';
import { operationsPreview, previewPermissions, type PreviewResource } from '@/server/operations-service';
export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params;
    if (!Object.hasOwn(previewPermissions, resource)) throw new ApiError(404, 'previewUnavailable');
    const key = resource as PreviewResource;
    const { user } = await requestSession(request, previewPermissions[key]);
    await consumeLimit(`preview:${user.tenantId}:${user.id}`, 60, 60);
    return json(await operationsPreview(user, key, requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
