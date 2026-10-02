# Architecture decisions

- Clone automation flows in one authenticated database transaction scoped to the selected workspace, so partial copies cannot survive a failed operation.