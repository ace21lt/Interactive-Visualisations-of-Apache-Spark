package api

import handlers.{HealthHandler, LoginHandler, NotebookHandler}
import zio.*
import zio.http.*

// Route definitions only - delegates to handlers
object Routes:

  def apply(): zio.http.Routes[LoginHandler & NotebookHandler & HealthHandler, Response] =
    zio.http.Routes.fromIterable(
      Chunk(
        // Authentication endpoints
        Method.POST / "api" / "login"  -> handler { (req: Request) =>
          ZIO.serviceWithZIO[LoginHandler](_.login(req))
        },
        Method.POST / "api" / "logout" -> handler { (req: Request) =>
          ZIO.serviceWithZIO[LoginHandler](_.logout(req))
        },
        Method.GET / "api" / "me"      -> handler { (req: Request) =>
          ZIO.serviceWithZIO[LoginHandler](_.me(req))
        },

        // Notebook execution
        Method.POST / "trigger" -> handler { (req: Request) =>
          ZIO.serviceWithZIO[NotebookHandler](_.trigger(req))
        },

        // Health check
        Method.GET / "health" -> handler { (req: Request) =>
          ZIO.serviceWithZIO[HealthHandler](_.health(req))
        }
      )
    )
