-- Covers the optional audit foreign key used when deleting or looking up the
-- administrator who assigned a department head.
CREATE INDEX idx_department_heads_assigned_by ON department_heads(assigned_by_id);
