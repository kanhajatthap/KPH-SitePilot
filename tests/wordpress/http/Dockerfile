FROM php:8.2.29-fpm-bookworm
RUN docker-php-ext-install mysqli opcache
COPY pool.conf /usr/local/etc/php-fpm.d/zz-fixture.conf
COPY opcache.ini /usr/local/etc/php/conf.d/zz-fixture.ini
