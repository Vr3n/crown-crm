//! Staff, roles and permissions. Mirrors `src/main/application/access.ts`.

use serde_json::{json, Value};

use crate::audit;
use crate::auth::hash_password;
use crate::db::permissions::codes as perm;
use crate::error::{AppError, AppResult};
use crate::identity::repo;
use crate::json::{arg, array, opt_i64, opt_str, req_i64, req_str};
use crate::state::Ctx;

pub mod guards {
    use crate::error::{AppError, AppResult};
    use crate::identity::repo::Role;
    use crate::state::Session;

    /// A non-super actor may only hand out permissions they already hold.
    pub fn assert_can_grant_permissions(session: &Session, codes: &[String], denied: &str) -> AppResult<()> {
        if session.is_super {
            return Ok(());
        }
        if codes.iter().any(|code| !session.permissions.contains(code)) {
            return Err(AppError::permission_denied(denied));
        }
        Ok(())
    }

    pub fn assert_can_manage_role(session: &Session, role: &Role, current_codes: &[String]) -> AppResult<()> {
        if session.is_super {
            return Ok(());
        }
        if role.is_super {
            return Err(AppError::permission_denied(crate::db::permissions::codes::ROLE_MANAGE));
        }
        assert_can_grant_permissions(session, current_codes, crate::db::permissions::codes::ROLE_MANAGE)
    }

    pub fn assert_can_assign_role(session: &Session, role: &Role, current_codes: &[String]) -> AppResult<()> {
        if session.is_super {
            return Ok(());
        }
        if role.is_super {
            return Err(AppError::permission_denied(crate::db::permissions::codes::USER_MANAGE));
        }
        assert_can_grant_permissions(session, current_codes, crate::db::permissions::codes::USER_MANAGE)
    }
}

fn humanize_permission(code: &str) -> String {
    code.split('.')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn role_output(conn: &rusqlite::Connection, company_id: i64, role: &repo::Role) -> AppResult<Value> {
    let mut permission_codes = repo::role_permission_codes(conn, role.id)?;
    permission_codes.sort();
    Ok(json!({
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "isSystemRole": role.is_system_role,
        "isSuper": role.is_super,
        "permissionCodes": permission_codes,
        "memberCount": repo::role_member_count(conn, company_id, role.id)?
    }))
}

fn validate_permission_codes(conn: &rusqlite::Connection, codes: &[String]) -> AppResult<Vec<String>> {
    let mut unique: Vec<String> = Vec::new();
    for code in codes {
        let code = code.trim().to_string();
        if !code.is_empty() && !unique.contains(&code) {
            unique.push(code);
        }
    }
    let found = repo::existing_permission_codes(conn, &unique)?;
    if found.len() != unique.len() {
        return Err(AppError::validation("One or more selected permissions are not recognised"));
    }
    unique.sort();
    Ok(unique)
}

fn normalize_role_name(raw: &str) -> AppResult<String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.chars().count() < 2 {
        return Err(AppError::validation("Role name must be at least 2 characters"));
    }
    Ok(name)
}

fn list_staff(ctx: &Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::USER_VIEW)?;
    let company_id = ctx.company_id()?;
    let actor_id = ctx.user_id()?;
    let rows = repo::list_staff(ctx.db(), company_id)?;
    Ok(json!(rows.iter().map(|row| row.to_json(row.user_id == actor_id)).collect::<Vec<_>>()))
}

fn list_roles(ctx: &Ctx<'_>) -> AppResult<Value> {
    if !ctx.has_permission(perm::USER_VIEW) && !ctx.has_permission(perm::ROLE_VIEW) {
        return Err(AppError::permission_denied(perm::ROLE_VIEW));
    }
    let company_id = ctx.company_id()?;
    let mut out = Vec::new();
    for role in repo::list_roles(ctx.db(), company_id)? {
        out.push(role_output(ctx.db(), company_id, &role)?);
    }
    Ok(json!(out))
}

fn list_permissions(ctx: &Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::ROLE_VIEW)?;
    let out: Vec<Value> = repo::list_permissions(ctx.db())?
        .into_iter()
        .map(|permission| {
            json!({
                "code": permission.code,
                "description": permission.description.unwrap_or_else(|| humanize_permission(&permission.code)),
                "domain": permission.code.split('.').next().unwrap_or("other")
            })
        })
        .collect();
    Ok(json!(out))
}

fn create_role(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ROLE_MANAGE)?;
    let company_id = ctx.company_id()?;
    let actor_id = ctx.user_id()?;
    let session = ctx.session().cloned().ok_or_else(|| AppError::unauthenticated("Authentication required"))?;

    let name = normalize_role_name(&req_str(input, "name")?)?;
    if repo::find_role_by_name_insensitive(ctx.db(), company_id, &name, None)?.is_some() {
        return Err(AppError::validation(format!("A role named \"{name}\" already exists")));
    }
    let raw_codes: Vec<String> = array(input, "permissionCodes")
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    let permission_codes = validate_permission_codes(ctx.db(), &raw_codes)?;
    guards::assert_can_grant_permissions(&session, &permission_codes, perm::ROLE_MANAGE)?;
    let description = opt_str(input, "description").map(|d| d.trim().to_string()).filter(|d| !d.is_empty());

    ctx.with_tx(|ctx| {
        let role = repo::create_role(ctx.db(), company_id, &name, description.as_deref())?;
        repo::set_role_permissions(ctx.db(), role.id, &permission_codes)?;
        audit::record(
            ctx.db(),
            company_id,
            "ROLE",
            role.id,
            "CREATE",
            None,
            Some(&json!({
                "name": name,
                "description": description,
                "permissionCodes": permission_codes
            })),
            Some(actor_id),
        )?;
        role_output(ctx.db(), company_id, &role)
    })
}

fn update_role(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ROLE_MANAGE)?;
    let company_id = ctx.company_id()?;
    let actor_id = ctx.user_id()?;
    let session = ctx.session().cloned().ok_or_else(|| AppError::unauthenticated("Authentication required"))?;

    let id = req_i64(input, "id")?;
    let role = repo::find_role(ctx.db(), company_id, id)?.ok_or_else(|| AppError::not_found("Role not found"))?;
    if role.is_system_role {
        return Err(AppError::validation(
            "Owner and Admin are locked system roles and cannot be edited",
        ));
    }

    let current_codes = repo::role_permission_codes(ctx.db(), role.id)?;
    guards::assert_can_manage_role(&session, &role, &current_codes)?;

    let name = match opt_str(input, "name") {
        Some(name) => normalize_role_name(&name)?,
        None => role.name.clone(),
    };
    if repo::find_role_by_name_insensitive(ctx.db(), company_id, &name, Some(role.id))?.is_some() {
        return Err(AppError::validation(format!("A role named \"{name}\" already exists")));
    }

    let description = if input.get("description").is_some() {
        opt_str(input, "description").map(|d| d.trim().to_string()).filter(|d| !d.is_empty())
    } else {
        role.description.clone()
    };

    let permission_codes = if input.get("permissionCodes").is_some() {
        let raw: Vec<String> = array(input, "permissionCodes")
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        let codes = validate_permission_codes(ctx.db(), &raw)?;
        guards::assert_can_grant_permissions(&session, &codes, perm::ROLE_MANAGE)?;
        Some(codes)
    } else {
        None
    };

    ctx.with_tx(|ctx| {
        let updated = repo::update_role(ctx.db(), company_id, role.id, Some(&name), Some(description.as_deref()))?
            .ok_or_else(|| AppError::not_found("Role not found"))?;
        if let Some(codes) = &permission_codes {
            repo::set_role_permissions(ctx.db(), role.id, codes)?;
        }
        audit::record(
            ctx.db(),
            company_id,
            "ROLE",
            role.id,
            "UPDATE",
            Some(&json!({
                "name": role.name,
                "description": role.description,
                "permissionCodes": current_codes
            })),
            Some(&json!({
                "name": name,
                "description": description,
                "permissionCodes": permission_codes.clone().unwrap_or(current_codes)
            })),
            Some(actor_id),
        )?;
        role_output(ctx.db(), company_id, &updated)
    })
}

fn delete_role(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ROLE_MANAGE)?;
    let company_id = ctx.company_id()?;
    let actor_id = ctx.user_id()?;
    let session = ctx.session().cloned().ok_or_else(|| AppError::unauthenticated("Authentication required"))?;

    let id = req_i64(input, "id")?;
    let role = repo::find_role(ctx.db(), company_id, id)?.ok_or_else(|| AppError::not_found("Role not found"))?;
    if role.is_system_role {
        return Err(AppError::validation(
            "Owner and Admin are locked system roles and cannot be deleted",
        ));
    }
    let current_codes = repo::role_permission_codes(ctx.db(), role.id)?;
    guards::assert_can_manage_role(&session, &role, &current_codes)?;

    let members = repo::role_member_count(ctx.db(), company_id, role.id)?;
    if members > 0 {
        let noun = if members == 1 { "person" } else { "people" };
        return Err(AppError::conflict(format!(
            "This role is still assigned to {members} {noun}. Move them to another role first."
        )));
    }

    ctx.with_tx(|ctx| {
        repo::delete_role(ctx.db(), company_id, role.id)?;
        audit::record(
            ctx.db(),
            company_id,
            "ROLE",
            role.id,
            "DELETE",
            Some(&json!({
                "name": role.name,
                "description": role.description,
                "permissionCodes": current_codes
            })),
            None,
            Some(actor_id),
        )?;
        Ok(())
    })?;
    Ok(json!(true))
}

fn update_staff(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::USER_MANAGE)?;
    let company_id = ctx.company_id()?;
    let session = ctx.session().cloned().ok_or_else(|| AppError::unauthenticated("Authentication required"))?;
    let actor_id = session.user_id;

    let id = req_i64(input, "id")?;
    let target = repo::find_staff_target(ctx.db(), company_id, id)?
        .ok_or_else(|| AppError::not_found("User not found"))?;

    // A non-super actor cannot manage a super role or a role holding
    // permissions the actor lacks.
    if !session.is_super {
        if target.role_is_super {
            return Err(AppError::permission_denied(perm::USER_MANAGE));
        }
        let codes = repo::role_permission_codes(ctx.db(), target.role_id)?;
        if codes.iter().any(|code| !session.permissions.contains(code)) {
            return Err(AppError::permission_denied(perm::USER_MANAGE));
        }
    }

    let is_self = target.user_id == actor_id;
    let next_role_id = opt_i64(input, "roleId");
    let next_status = opt_str(input, "status");

    if is_self {
        if let Some(role_id) = next_role_id {
            if role_id != target.role_id {
                return Err(AppError::validation("You cannot change your own role"));
            }
        }
        if next_status.as_deref() == Some("DISABLED") {
            return Err(AppError::validation("You cannot disable your own account"));
        }
    }

    let full_name = match opt_str(input, "fullName") {
        Some(name) => {
            let name = name.trim().to_string();
            if name.is_empty() {
                return Err(AppError::validation("Full name is required"));
            }
            name
        }
        None => target.user_full_name.clone(),
    };

    let mut next_role: Option<repo::Role> = None;
    if let Some(role_id) = next_role_id {
        let role = repo::find_role(ctx.db(), company_id, role_id)?
            .ok_or_else(|| AppError::not_found("Role not found"))?;
        let codes = repo::role_permission_codes(ctx.db(), role.id)?;
        guards::assert_can_assign_role(&session, &role, &codes)?;
        next_role = Some(role);
    }

    let losing_super = target.role_is_super
        && (next_status.as_deref() == Some("DISABLED")
            || next_role.as_ref().is_some_and(|role| !role.is_super));
    if losing_super && repo::count_active_supers(ctx.db(), company_id, Some(target.staff_id))? == 0 {
        return Err(AppError::validation("At least one active Owner or Admin must remain"));
    }

    if let Some(status) = &next_status {
        if !matches!(status.as_str(), "ACTIVE" | "DISABLED") {
            return Err(AppError::validation("Unknown staff status"));
        }
    }

    let updated_name = full_name.clone();
    let name_changed = input.get("fullName").is_some();

    ctx.with_tx(|ctx| {
        if name_changed {
            repo::update_user_name(ctx.db(), target.user_id, &updated_name)?;
        }
        if let Some(status) = &next_status {
            repo::update_user_status(ctx.db(), target.user_id, status)?;
        }
        if next_role_id.is_some() || next_status.is_some() {
            repo::update_membership(ctx.db(), target.staff_id, next_role_id, next_status.as_deref())?;
        }

        let action = match next_status.as_deref() {
            Some("DISABLED") => "DEACTIVATE",
            Some("ACTIVE") => "REACTIVATE",
            _ => "UPDATE",
        };
        audit::record(
            ctx.db(),
            company_id,
            "USER",
            target.user_id,
            action,
            Some(&json!({
                "fullName": target.user_full_name,
                "roleId": target.role_id,
                "status": target.staff_status
            })),
            Some(&json!({
                "fullName": full_name,
                "roleId": next_role_id.unwrap_or(target.role_id),
                "status": next_status.clone().unwrap_or_else(|| target.staff_status.clone())
            })),
            Some(actor_id),
        )?;

        let refreshed = repo::list_staff(ctx.db(), company_id)?
            .into_iter()
            .find(|row| row.id == target.staff_id)
            .ok_or_else(|| AppError::not_found("User not found"))?;
        Ok(refreshed.to_json(is_self))
    })
    .map(|value| {
        if is_self && name_changed {
            if let Some(current) = ctx.inner.session.as_mut() {
                current.user_full_name = updated_name.clone();
            }
        }
        value
    })
}

fn reset_staff_password(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::USER_MANAGE)?;
    let company_id = ctx.company_id()?;
    let actor_id = ctx.user_id()?;
    let session = ctx.session().cloned().ok_or_else(|| AppError::unauthenticated("Authentication required"))?;

    let id = req_i64(input, "id")?;
    let target = repo::find_staff_target(ctx.db(), company_id, id)?
        .ok_or_else(|| AppError::not_found("User not found"))?;

    if !session.is_super {
        if target.role_is_super {
            return Err(AppError::permission_denied(perm::USER_MANAGE));
        }
        let codes = repo::role_permission_codes(ctx.db(), target.role_id)?;
        if codes.iter().any(|code| !session.permissions.contains(code)) {
            return Err(AppError::permission_denied(perm::USER_MANAGE));
        }
    }

    let password = req_str(input, "password")?;
    if password.len() < 8 {
        return Err(AppError::validation("Password must be at least 8 characters"));
    }
    let password_hash = hash_password(&password)?;

    ctx.with_tx(|ctx| {
        repo::update_user_password(ctx.db(), target.user_id, &password_hash)?;
        audit::record(
            ctx.db(),
            company_id,
            "USER",
            target.user_id,
            "PASSWORD_RESET",
            None,
            Some(&json!({ "userId": target.user_id })),
            Some(actor_id),
        )?;
        Ok(())
    })?;
    Ok(json!(true))
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "identity:staff" => Some(list_staff(ctx)),
        "identity:roles" => Some(list_roles(ctx)),
        "identity:permissions" => Some(list_permissions(ctx)),
        "identity:updateStaff" => Some(update_staff(ctx, arg(args, 0))),
        "identity:resetStaffPassword" => Some(reset_staff_password(ctx, arg(args, 0))),
        "identity:roleCreate" => Some(create_role(ctx, arg(args, 0))),
        "identity:roleUpdate" => Some(update_role(ctx, arg(args, 0))),
        "identity:roleDelete" => Some(delete_role(ctx, arg(args, 0))),
        _ => None,
    }
}
