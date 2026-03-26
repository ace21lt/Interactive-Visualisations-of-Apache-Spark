package databricks

import zio.*

trait RetryPolicy:
  def schedule: Schedule[Any, Throwable, Any]
  def pollInterval(baseSeconds: Int, slowDownFactor: Double): Duration

// Default exponential backoff retry policy
case class ExponentialBackoffRetryPolicy(base: Duration, maxRetries: Int) extends RetryPolicy:
  override def schedule: Schedule[Any, Throwable, Any] =
    Schedule.exponential(base) && Schedule.recurs(maxRetries)

  override def pollInterval(baseSeconds: Int, slowDownFactor: Double): Duration =
    (baseSeconds * slowDownFactor).toInt.seconds

object RetryPolicy:
  val default: RetryPolicy = ExponentialBackoffRetryPolicy(1.second, 3)

  val layer: ULayer[RetryPolicy] = ZLayer.succeed(default)

  def make(base: Duration, maxRetries: Int): ULayer[RetryPolicy] =
    ZLayer.succeed(ExponentialBackoffRetryPolicy(base, maxRetries))
