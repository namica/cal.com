import { ArrowRightIcon } from "@heroicons/react/outline";
import { GetStaticPaths, GetStaticPropsContext } from "next";
import { i18n } from "next-i18next.config";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect } from "react";

import { useLocale } from "@lib/hooks/useLocale";
import useTheme from "@lib/hooks/useTheme";
import prisma from "@lib/prisma";
import { trpc } from "@lib/trpc";
import { inferSSRProps } from "@lib/types/inferSSRProps";

import Loader from "@components/Loader";
import EventTypeDescription from "@components/eventtype/EventTypeDescription";
import { HeadSeo } from "@components/seo/head-seo";
import Avatar from "@components/ui/Avatar";

import { ssgInit } from "@server/ssg";

export default function User(props: inferSSRProps<typeof getStaticProps>) {
  const { username } = props;
  const utils = trpc.useContext();

  // data of query below will be will be generally prepopulated b/c of `getStaticProps`
  const query = trpc.useQuery(["booking.userEventTypes", { username }], { enabled: !!username });

  const { t } = useLocale();
  const router = useRouter();

  const { isReady } = useTheme(query.data?.user.theme);
  useEffect(() => {
    if (!query.data || !username) {
      return;
    }
    for (const { slug } of query.data.eventTypes) {
      utils.prefetchQuery(["booking.eventTypeByUsername", { slug, username }]);
    }
  }, [query.data, username, utils]);
  if (!query.data) {
    return <Loader />;
  }

  const { user, eventTypes } = query.data;
  const nameOrUsername = user.name || user.username || "";

  return (
    <>
      <HeadSeo
        title={nameOrUsername}
        description={nameOrUsername}
        name={nameOrUsername}
        avatar={user.avatar || ""}
      />
      {isReady && (
        <div className="h-screen bg-neutral-50 dark:bg-black">
          <main className="max-w-3xl px-4 py-24 mx-auto">
            <div className="mb-8 text-center">
              <Avatar
                imageSrc={user.avatar}
                className="w-24 h-24 mx-auto mb-4 rounded-full"
                alt={nameOrUsername}
              />
              <h1 className="mb-1 text-3xl font-bold font-cal text-neutral-900 dark:text-white">
                {nameOrUsername}
              </h1>
              <p className="text-neutral-500 dark:text-white">{user.bio}</p>
            </div>
            <div className="space-y-6" data-testid="event-types">
              {eventTypes.map((type) => (
                <div
                  key={type.id}
                  className="relative bg-white border rounded-sm group dark:bg-neutral-900 dark:border-0 dark:hover:border-neutral-600 hover:bg-gray-50 border-neutral-200 hover:border-brand">
                  <ArrowRightIcon className="absolute w-4 h-4 text-black transition-opacity opacity-0 right-3 top-3 dark:text-white group-hover:opacity-100" />
                  <Link
                    href={{
                      pathname: `/${user.username}/${type.slug}`,
                      query: {
                        ...router.query,
                      },
                    }}>
                    <a className="block px-6 py-4" data-testid="event-type-link">
                      <h2 className="font-semibold text-neutral-900 dark:text-white">{type.title}</h2>
                      <EventTypeDescription eventType={type} />
                    </a>
                  </Link>
                </div>
              ))}
            </div>
            {eventTypes.length === 0 && (
              <div className="overflow-hidden rounded-sm shadow">
                <div className="p-8 text-center text-gray-400 dark:text-white">
                  <h2 className="text-3xl font-semibold text-gray-600 font-cal dark:text-white">
                    {t("uh_oh")}
                  </h2>
                  <p className="max-w-md mx-auto">{t("no_event_types_have_been_setup")}</p>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const users = await prisma.user.findMany({
    select: {
      username: true,
      locale: true,
    },
    where: {
      // will statically render everyone on the PRO plan
      // the rest will be statically rendered on first visit
      plan: "PRO",
    },
  });
  const { defaultLocale } = i18n;
  return {
    paths: users.flatMap((user) => {
      if (!user.username) {
        return [];
      }
      // statically render english
      const paths = [
        {
          params: {
            user: user.username,
            locale: defaultLocale,
          },
        },
      ];
      // statically render user's preferred language
      if (user.locale && user.locale !== defaultLocale) {
        const locale = user.locale;
        paths.push({
          params: {
            user: user.username,
            locale,
          },
        });
      }
      return paths;
    }),

    // https://nextjs.org/docs/basic-features/data-fetching#fallback-blocking
    fallback: true,
  };
};

export async function getStaticProps(context: GetStaticPropsContext<{ user: string; locale: string }>) {
  const ssg = await ssgInit(context);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const username = context.params!.user;
  const data = await ssg.fetchQuery("booking.userEventTypes", { username });

  if (!data) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      trpcState: ssg.dehydrate(),
      username,
    },
    revalidate: 1,
  };
}