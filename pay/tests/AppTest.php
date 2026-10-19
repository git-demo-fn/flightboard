<?php

declare(strict_types=1);

namespace Flightboard\Pay\Tests;

use Flightboard\Pay\App;
use PHPUnit\Framework\TestCase;

final class AppTest extends TestCase
{
    public function testHealth(): void
    {
        [$status, $body] = (new App())->handle('GET', '/health', '');

        self::assertSame(200, $status);
        self::assertSame(['status' => 'ok'], $body);
    }

    public function testQuote(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{"type":"Fixed","rate":180}');

        self::assertSame(200, $status);
        self::assertSame(180.0, $body['total']);
    }

    public function testQuoteWithInvalidJson(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{oops');

        self::assertSame(400, $status);
        self::assertSame('invalid JSON body', $body['error']);
    }

    public function testQuoteWithInvalidPay(): void
    {
        [$status] = (new App())->handle('POST', '/quote', '{"type":"Hourly","rate":10}');

        self::assertSame(400, $status);
    }

    public function testQuoteWithUnsupportedType(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{"type":"Blended","rate":10}');

        self::assertSame(422, $status);
        self::assertStringContainsString('Blended', $body['error']);
    }

    public function testUnknownRoute(): void
    {
        [$status] = (new App())->handle('GET', '/nope', '');

        self::assertSame(404, $status);
    }
}
