"""
Every admin-gated route must stay admin-gated.

get_current_admin is reimplemented on top of the RBAC core, and it guards ~130
call sites that this suite otherwise touches only a handful of. Enumerating the
routes from the app itself - rather than listing them - means a route that
loses its guard in a refactor fails here even though no hand-written test
covers it.

This is a characterization test: it passes before the rewrite and must keep
passing after. A route added later with no guard does not fail it; only losing
a guard does.
"""

import pytest
from fastapi.routing import APIRoute

from app.dependencies import get_current_admin
from app.main import app

PATH_PARAM_STUB = "00000000-0000-0000-0000-000000000000"


def _guards(dependant) -> bool:
    """True when get_current_admin appears anywhere in a route's dependency tree."""
    if dependant.call is get_current_admin:
        return True
    return any(_guards(sub) for sub in dependant.dependencies)


def _method_of(route: APIRoute) -> str:
    for verb in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        if verb in route.methods:
            return verb
    return "GET"


def _admin_routes() -> list[tuple[str, str]]:
    out = []
    for route in app.routes:
        if isinstance(route, APIRoute) and _guards(route.dependant):
            path = route.path
            for param in route.dependant.path_params:
                path = path.replace("{" + param.name + "}", PATH_PARAM_STUB)
            out.append((_method_of(route), path))
    return sorted(set(out))


ADMIN_ROUTES = _admin_routes()


def test_the_enumeration_found_the_admin_surface():
    """Guards against the walk silently finding nothing and passing vacuously."""
    assert len(ADMIN_ROUTES) > 100, f"only found {len(ADMIN_ROUTES)} admin routes"


@pytest.mark.parametrize("method,path", ADMIN_ROUTES, ids=lambda v: str(v))
def test_admin_route_rejects_an_anonymous_caller(client, method, path):
    response = client.request(method, path)
    assert response.status_code == 401, (
        f"{method} {path} answered {response.status_code} to an anonymous caller"
    )
