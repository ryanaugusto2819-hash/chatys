# Architecture decisions

- Clone automation flows in one authenticated database transaction scoped to the selected workspace, so partial copies cannot survive a failed operation.
- Create WhatsApp connections in the selected workspace through the authenticated connection handler, so credentials and provider configuration cannot be attached to another workspace.
- Store the uazapiGO server origin rather than its instance dashboard path, because provider API routes are rooted at the origin.