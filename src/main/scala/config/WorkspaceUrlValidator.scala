package config

import service.DatabricksError

import java.net.{IDN, InetAddress, URI}

object WorkspaceUrlValidator:

  trait DnsResolver:
    def resolveAll(host: String): Either[DatabricksError.ValidationError, List[InetAddress]]

  object DnsResolver:
    val live: DnsResolver = host =>
      try Right(InetAddress.getAllByName(host).toList)
      catch case _: Exception => Left(DatabricksError.ValidationError("Could not resolve workspace host"))

  def validate(url: String): Either[DatabricksError.ValidationError, String] =
    validate(url, DnsResolver.live)

  def validate(url: String, dns: DnsResolver): Either[DatabricksError.ValidationError, String] =
    val trimmed = Option(url).map(_.trim).getOrElse("")
    for
      _      <- Either.cond(trimmed.nonEmpty, (), DatabricksError.ValidationError("Workspace URL is required"))
      uri    <- parseUri(trimmed)
      scheme  = Option(uri.getScheme).getOrElse("").toLowerCase
      _      <- Either.cond(
                  scheme == "https",
                  (),
                  DatabricksError.ValidationError("Workspace URL must start with https://")
                )
      hostRaw = Option(uri.getHost).getOrElse("")
      _      <- Either.cond(hostRaw.nonEmpty, (), DatabricksError.ValidationError("Workspace URL must include a host"))
      host    = IDN.toASCII(hostRaw).toLowerCase
      _      <- Either.cond(
                  host.endsWith(".databricks.com"),
                  (),
                  DatabricksError.ValidationError("Workspace URL must be a Databricks domain (.databricks.com)")
                )
      _      <- Either.cond(
                  host != "localhost" && !host.endsWith(".localhost"),
                  (),
                  DatabricksError.ValidationError("localhost is not allowed")
                )
      addrs  <- dns.resolveAll(host)
      _      <- Either.cond(
                  !addrs.exists(isDisallowedAddress),
                  (),
                  DatabricksError.ValidationError("Workspace host resolves to a private or reserved IP address")
                )
    yield
      val port     = uri.getPort
      val portPart = if port > 0 && port != 443 then s":$port" else ""
      s"https://$host$portPart"

  private def parseUri(trimmed: String): Either[DatabricksError.ValidationError, URI] =
    try Right(new URI(trimmed))
    catch case _: Exception => Left(DatabricksError.ValidationError("Invalid workspace URL"))

  private def isDisallowedAddress(addr: InetAddress): Boolean =
    addr.isAnyLocalAddress ||
      addr.isLoopbackAddress ||
      addr.isLinkLocalAddress ||
      addr.isSiteLocalAddress ||
      addr.isMulticastAddress ||
      addr.getHostAddress == "0.0.0.0" ||
      addr.getHostAddress == "::" ||
      isInCidr(addr, "100.64.0.0", 10) ||
      isIpv6Ula(addr)

  // Check IPv6 Unique Local Address (fc00::/7) by testing high 7 bits of first byte.
  private def isIpv6Ula(addr: InetAddress): Boolean =
    addr match
      case inet6: java.net.Inet6Address =>
        val firstByte = inet6.getAddress()(0)
        (firstByte & 0xfe.toByte) == 0xfc.toByte
      case _                            => false

  private def isInCidr(addr: InetAddress, baseIpV4: String, prefixBits: Int): Boolean =
    val a = addr.getAddress
    if a.length != 4 then false
    else
      val base = InetAddress.getByName(baseIpV4).getAddress
      val mask =
        if prefixBits == 0 then 0
        else -1 << (32 - prefixBits)

      def toInt(bytes: Array[Byte]): Int =
        def u8(i: Int): Int = bytes(i) & 0xff
        (u8(0) << 24) | (u8(1) << 16) | (u8(2) << 8) | u8(3)

      (toInt(a) & mask) == (toInt(base) & mask)
